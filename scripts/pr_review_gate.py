#!/usr/bin/env python3
"""Fail-closed, read-only pre-merge Codex review gate for an exact PR head.

No model calls; it ONLY consumes the review Codex already posted. Never merges,
requests a new review, posts comments, modifies branches, or changes settings.
"""
from __future__ import annotations
import argparse
from dataclasses import dataclass
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = 'https://api.github.com'
REPO = re.compile(r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')
SHA = re.compile(r'^[0-9a-f]{40}$')
CODEX_MARKER = re.compile(r'<!--\s*codex-review-state:v1\s+(\{[^\n]*\})\s*-->')
CODEX_BOT = 'chatgpt-codex-connector[bot]'
MAX_PAGES = 20

class ReviewGateError(RuntimeError):
    pass

@dataclass(frozen=True)
class Outcome:
    ready: bool
    code: str
    head: str
    details: dict
    def as_dict(self):
        return {'schema':'agentops.pr-review-gate.v1', 'ready':self.ready,
                'code':self.code, 'head':self.head, **self.details}


def evaluate(pr: dict, issue_comments: list, threads: list, reviews: list,
             *, expected_head: str | None = None) -> Outcome:
    """Pure check: submitted review on current exact head + zero open threads."""
    if not isinstance(pr,dict) or not isinstance(pr.get('head'),dict):
        raise ReviewGateError('Invalid PR facts')
    head = pr['head'].get('sha')
    if not isinstance(head,str) or not SHA.fullmatch(head):
        raise ReviewGateError('Missing or invalid PR head SHA')
    if expected_head and head != expected_head:
        return Outcome(False,'HEAD_MOVED',head,{'expected_head':expected_head})
    if pr.get('state')!='open' or pr.get('merged_at'):
        return Outcome(False,'NOT_OPEN',head,{})
    if pr.get('draft') is True:
        return Outcome(False,'DRAFT',head,{})
    if pr.get('mergeable') is False:
        return Outcome(False,'CONFLICT',head,{})
    if not isinstance(issue_comments,list) or not isinstance(threads,list) or not isinstance(reviews,list):
        raise ReviewGateError('Review evidence collections are incomplete')

    states=[]
    for comment in issue_comments:
        if not isinstance(comment,dict):
            raise ReviewGateError('Malformed issue comment')
        author=(comment.get('user') or {}).get('login','')
        if author.lower()!=CODEX_BOT:continue
        match=CODEX_MARKER.search(comment.get('body') or '')
        if not match:continue
        try:state=json.loads(match.group(1))
        except (ValueError,TypeError):raise ReviewGateError('Malformed Codex status summary')
        if not isinstance(state.get('code_review'),dict):raise ReviewGateError('Incomplete Codex review summary')
        states.append((comment.get('updated_at') or comment.get('created_at') or '',int(comment.get('id',0)),state))
    if not states:
        return Outcome(False,'CODEX_MISSING',head,{'action':'No new Codex review requested'})
    states.sort(key=lambda v:(v[0],v[1]))
    code_review=states[-1][2]['code_review']
    review_sha=code_review.get('commit_sha')
    if review_sha!=head:
        return Outcome(False,'CODEX_STALE',head,{'reviewed_head':review_sha})
    if code_review.get('status')!='completed':
        return Outcome(False,'CODEX_PENDING',head,{'codex_status':code_review.get('status')})

    open_threads=[]
    for thread in threads:
        if not isinstance(thread,dict) or not isinstance(thread.get('isResolved'),bool):
            raise ReviewGateError('Incomplete review-thread evidence')
        if not thread['isResolved']:
            open_threads.append({'id':thread.get('id'),'path':thread.get('path'),
                                 'outdated':thread.get('isOutdated')})
    if open_threads:
        return Outcome(False,'UNRESOLVED_THREADS',head,
                       {'unresolved_count':len(open_threads),'unresolved':open_threads[:30]})

    # COMMENTED is not a substantive review decision. A later comment-only
    # submission cannot clear an outstanding CHANGES_REQUESTED; only APPROVED
    # or DISMISSED may do so. Independently verified review-thread disposition
    # is a separate requirement above.
    recent={}
    for review in reviews:
        if not isinstance(review,dict):raise ReviewGateError('Malformed review submission')
        author=(review.get('user') or {}).get('login','').lower()
        submitted=review.get('submitted_at') or ''
        state=review.get('state')
        if not author or not submitted or state not in {'CHANGES_REQUESTED','APPROVED','DISMISSED'}:
            continue
        if author not in recent or submitted >= recent[author][0]:
            recent[author]=(submitted,state)
    blocking=[a for a,(_,state) in recent.items() if state=='CHANGES_REQUESTED']
    if blocking:
        return Outcome(False,'CHANGES_REQUESTED',head,{'reviewers':sorted(blocking)})
    return Outcome(True,'READY',head,{'codex_review_completed':True,'unresolved_count':0})


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args):
        return None

class GitHubReadOnly:
    def __init__(self,token:str):
        if not token:raise ReviewGateError('GITHUB_TOKEN is required')
        self._token=token
        self.opener=urllib.request.build_opener(NoRedirect())
    def _request(self,url,payload=None):
        parts=urllib.parse.urlsplit(url)
        if parts.scheme!='https' or parts.netloc!='api.github.com' or parts.username or parts.fragment:
            raise ReviewGateError('Only api.github.com HTTPS endpoints allowed')
        headers={'Authorization':'Bearer '+self._token,'Accept':'application/vnd.github+json',
                 'X-GitHub-Api-Version':'2022-11-28','User-Agent':'agentops-pr-review-gate'}
        req=urllib.request.Request(url,data=(json.dumps(payload).encode() if payload is not None else None),headers=headers,method=('POST' if payload is not None else 'GET'))
        try:
            with self.opener.open(req,timeout=30) as response:
                data=response.read(8*1024*1024+1)
        except (urllib.error.HTTPError,urllib.error.URLError,TimeoutError) as exc:
            raise ReviewGateError('GitHub review read failed: '+type(exc).__name__) from None
        if len(data)>8*1024*1024:raise ReviewGateError('GitHub response too large')
        try:return json.loads(data)
        except (ValueError,UnicodeError):raise ReviewGateError('Invalid GitHub response JSON') from None
    def get(self,path):return self._request(API+path)
    def pages(self,path):
        out=[]
        for page in range(1,MAX_PAGES+1):
            separator='&' if '?' in path else '?'
            batch=self.get(path+f'{separator}per_page=100&page={page}')
            if not isinstance(batch,list):raise ReviewGateError('Incomplete list evidence')
            out.extend(batch)
            if len(batch)<100:return out
        raise ReviewGateError('Pagination cap; refusing partial review evidence')
    def review_threads(self,repo,number):
        owner,name=repo.split('/')
        query='''query($owner:String!,$name:String!,$number:Int!,$after:String){
          repository(owner:$owner,name:$name){pullRequest(number:$number){
            reviewThreads(first:100,after:$after){pageInfo{hasNextPage endCursor}
              nodes{id isResolved isOutdated path}}}}}'''
        cursor=None;seen=set();out=[]
        for _ in range(MAX_PAGES):
            body=self._request(API+'/graphql',{'query':query,'variables':{'owner':owner,'name':name,'number':number,'after':cursor}})
            if body.get('errors'):raise ReviewGateError('GitHub GraphQL returned errors')
            try:collection=body['data']['repository']['pullRequest']['reviewThreads']
            except (KeyError,TypeError):raise ReviewGateError('Missing review threads') from None
            for node in collection['nodes']:
                if node['id'] in seen:raise ReviewGateError('Repeated review thread')
                seen.add(node['id']);out.append(node)
            if not collection['pageInfo']['hasNextPage']:return out
            cursor=collection['pageInfo'].get('endCursor')
            if not cursor:raise ReviewGateError('Incomplete review-thread pagination')
        raise ReviewGateError('Review-thread pagination cap')
    def collect(self,repo,number):
        path=f'/repos/{repo}'
        pr=self.get(path+f'/pulls/{number}')
        comments=self.pages(path+f'/issues/{number}/comments')
        threads=self.review_threads(repo,number)
        reviews=self.pages(path+f'/pulls/{number}/reviews')
        # Reject evidence that moved while we read it. A late Codex update or
        # thread resolution needs a fresh pre-merge evaluation, not a guess.
        recheck=self.get(path+f'/pulls/{number}')
        if pr.get('head',{}).get('sha')!=recheck.get('head',{}).get('sha') or pr.get('base',{}).get('sha')!=recheck.get('base',{}).get('sha'):
            raise ReviewGateError('PR head/base moved during evidence collection')
        comments_again=self.pages(path+f'/issues/{number}/comments')
        threads_again=self.review_threads(repo,number)
        reviews_again=self.pages(path+f'/pulls/{number}/reviews')
        if [(c.get('id'),c.get('updated_at'),c.get('body')) for c in comments] != [(c.get('id'),c.get('updated_at'),c.get('body')) for c in comments_again]:
            raise ReviewGateError('Codex/comment state changed during evidence collection')
        if threads != threads_again:
            raise ReviewGateError('Review threads changed during evidence collection')
        if [(r.get('id'),r.get('state'),r.get('submitted_at')) for r in reviews] != [(r.get('id'),r.get('state'),r.get('submitted_at')) for r in reviews_again]:
            raise ReviewGateError('Formal review state changed during evidence collection')
        return pr,comments,threads,reviews


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo',required=True)
    p.add_argument('--pr',type=int,required=True)
    p.add_argument('--expect-head')
    p.add_argument('--wait-seconds',type=int,default=0)
    p.add_argument('--poll-seconds',type=int,default=15)
    p.add_argument('--token-env',default='GITHUB_TOKEN')
    args=p.parse_args(argv)
    if not REPO.fullmatch(args.repo) or args.pr<1 or args.wait_seconds<0 or args.wait_seconds>900 or args.poll_seconds<5:
        p.error('Invalid repo, PR or bounded wait parameters')
    if args.expect_head and not SHA.fullmatch(args.expect_head):p.error('Invalid expected SHA')
    try:api=GitHubReadOnly(os.environ.get(args.token_env,''))
    except ReviewGateError as exc:print('BLOCKED:',exc,file=sys.stderr);return 2
    deadline=time.monotonic()+args.wait_seconds
    while True:
        try:outcome=evaluate(*api.collect(args.repo,args.pr),expected_head=args.expect_head)
        except ReviewGateError as exc:print('BLOCKED:',exc,file=sys.stderr);return 2
        print(json.dumps(outcome.as_dict(),sort_keys=True),flush=True)
        if outcome.ready:return 0
        if outcome.code not in {'CODEX_MISSING','CODEX_PENDING','CODEX_STALE'} or time.monotonic()+args.poll_seconds>deadline:
            return 1
        time.sleep(args.poll_seconds)

if __name__=='__main__':sys.exit(main())
