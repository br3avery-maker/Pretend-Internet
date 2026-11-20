"""Exercise the browser fallback's actual picker, IndexedDB and app player."""

from pathlib import Path
import os

from playwright.sync_api import expect, sync_playwright


app = Path(__file__).resolve().parent.parent / 'web2app' / 'index.html'
url = 'http://localhost:8372/'
page_file = {
    'name': 'Notes.html',
    'mimeType': 'text/html',
    'buffer': b"""<label>Note <input id="note"></label>
<script>
const note = document.querySelector('#note');
note.value = localStorage.getItem('fixture-note') || '';
note.oninput = () => localStorage.setItem('fixture-note', note.value);
</script>""",
}
extra_file = {'name': 'Notes.svg', 'mimeType': 'image/svg+xml',
              'buffer': b'<svg xmlns="http://www.w3.org/2000/svg"/>'}

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=os.environ.get('CHROMIUM', '/usr/bin/chromium'),
        args=['--no-sandbox', '--disable-dev-shm-usage'],
    )
    page = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route(url, lambda route: route.fulfill(path=app))
    page.goto(url)
    expect(page.locator('#emptyTitle')).to_have_text('No apps yet')
    page.locator('#gear').tap()

    # Abort the write triggered by the second file while using real IndexedDB.
    page.evaluate("""() => {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function(value, key) {
            const request = put.call(this, value, key);
            if (this.name === 'files' && key === 'notes.svg') {
                request.addEventListener('success', () => this.transaction.abort());
                IDBObjectStore.prototype.put = put;
            }
            return request;
        };
    }""")
    files = [page_file, extra_file]
    with page.expect_file_chooser() as picker:
        page.locator('#import').tap()
    picker.value.set_files(files)
    expect(page.locator('#status')).to_contain_text('Could not save imported files')
    expect(page.locator('#filesInput')).to_have_value('')

    saved_keys = page.evaluate("""() => new Promise((resolve, reject) => {
        const open = indexedDB.open('folder-launcher-v1', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result;
            const read = db.transaction(['files', 'settings'], 'readonly');
            const files = read.objectStore('files').getAllKeys();
            const settings = read.objectStore('settings').getAllKeys();
            read.oncomplete = () => { db.close(); resolve([files.result, settings.result]); };
            read.onabort = () => { db.close(); reject(read.error); };
        };
    })""")
    assert saved_keys == [[], []], saved_keys
    expect(page.get_by_role('button', name='Open Notes')).to_have_count(0)

    with page.expect_file_chooser() as picker:
        page.locator('#import').tap()
    picker.value.set_files(files)
    tile = page.get_by_role('button', name='Open Notes')
    expect(tile).to_be_visible()
    tile.tap()
    note = page.frame_locator('#appframe').get_by_role('textbox', name='Note')
    note.fill('Keep this note')
    page.get_by_role('button', name='Back to apps').tap()
    page.wait_for_url(url)
    page.reload()
    expect(page.locator('#folderLine')).to_have_text('Imported copies: 2 files')
    tile.tap()
    expect(note).to_have_value('Keep this note')
    assert not errors, errors
    browser.close()
    print('PASS: aborted import rolls back, retry saves both files, launched note survives reload')
