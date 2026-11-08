package xyz.chaoticka.folderlauncher;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.WindowManager;
import android.widget.FrameLayout;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Offline-first launcher: loose HTML (+ optional icon) and ZIP websites.
 * Folder access is obtained through SAF once, never via broad storage permission.
 * Apps open in a separate WebView without the trusted launcher JS bridge.
 * ZIP entries are inflated on demand in memory, not extracted to the filesystem.
 */
public final class MainActivity extends Activity {
    private static final int PICK_DIRECTORY=401, PICK_FILE=402;
    private static final String HOST="appassets.androidplatform.net";
    private static final String ORIGIN="https://"+HOST;
    private static final String APP_SUFFIX=".apps.folderlauncher.invalid";
    private static final String STORE="folder_launcher", URI_KEY="tree_uri";
    private static final int MAX_ZIP_ENTRIES=4000, MAX_ENTRY_BYTES=32*1024*1024;
    private final Object fileLock=new Object();
    private final Map<String,Uri> files=new HashMap<>();
    private final List<FileEntry> roots=new ArrayList<>();
    private final Map<String,AppEntry> apps=new HashMap<>();
    private final Map<String,AppEntry> appHosts=new HashMap<>();
    private FrameLayout root;
    private WebView home,opened;
    private Uri tree;
    private ValueCallback<Uri[]> pendingFiles;

    static final class FileEntry {
        final String name,path; final Uri uri;
        FileEntry(String n,String p,Uri u){name=n;path=p;uri=u;}
    }
    static final class AppEntry {
        final String id,label,url,iconUrl,host;
        AppEntry(String i,String l,String u,String icon,String h){id=i;label=l;url=u;iconUrl=icon;host=h;}
    }
    static final class ZipInfo {
        String html,icon;
    }

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().setNavigationBarColor(Color.BLACK);
        root=new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(11,11,15));
        setContentView(root);
        SharedPreferences preferences=getSharedPreferences(STORE,MODE_PRIVATE);
        String remembered=preferences.getString(URI_KEY,null);
        if(remembered!=null){try{tree=Uri.parse(remembered);}catch(Exception ignored){}}
        home=newWebView(true);
        home.addJavascriptInterface(new Bridge(),"AndroidLauncher");
        root.addView(home,new FrameLayout.LayoutParams(-1,-1));
        home.loadUrl("file:///android_asset/index.html");
    }

    private WebView newWebView(boolean trustedShell){
        WebView w=new WebView(this);
        w.setBackgroundColor(Color.rgb(11,11,15));
        WebSettings s=w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setSupportMultipleWindows(false);
        if(!trustedShell){
            w.setWebChromeClient(new WebChromeClient(){
                @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> cb,FileChooserParams params){
                    if(pendingFiles!=null)pendingFiles.onReceiveValue(null);
                    pendingFiles=cb;
                    try{startActivityForResult(params.createIntent(),PICK_FILE);return true;}
                    catch(Exception e){pendingFiles=null;cb.onReceiveValue(null);return false;}
                }
            });
        }
        w.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest req){
                Uri u=req.getUrl();
                if(!"https".equalsIgnoreCase(u.getScheme()))return null;
                String requestHost=u.getHost();
                if(requestHost==null)return null;
                if(requestHost.endsWith(APP_SUFFIX)){
                    AppEntry app; synchronized(fileLock){app=appHosts.get(requestHost);}
                    if(app==null)return notFound();
                    String path=u.getPath();
                    if(path==null||!path.startsWith("/")||!safePath(path.substring(1)))return notFound();
                    String relative=path.substring(1);
                    if(app.id.startsWith("zip:")){
                        Uri archive; synchronized(fileLock){archive=files.get(app.id.substring(4));}
                        if(archive==null)return notFound();
                        byte[] data=readZipEntry(archive,relative);
                        return data==null?notFound():new WebResourceResponse(mime(relative),charset(relative),new ByteArrayInputStream(data));
                    }
                    Uri source; synchronized(fileLock){source=files.get(relative);}
                    if(source==null)return notFound();
                    try{InputStream in=getContentResolver().openInputStream(source);
                        return in==null?notFound():new WebResourceResponse(mime(relative),charset(relative),in);
                    }catch(Exception ignored){return notFound();}
                }
                if(!HOST.equalsIgnoreCase(requestHost))return null;
                String path=u.getPath();
                if(path==null)return notFound();
                if(path.startsWith("/files/")){
                    String relative=path.substring(7);
                    if(!safePath(relative))return notFound();
                    Uri src; synchronized(fileLock){src=files.get(relative);}
                    if(src==null){scan();synchronized(fileLock){src=files.get(relative);}}
                    if(src==null)return notFound();
                    try{InputStream in=getContentResolver().openInputStream(src);
                        return in==null?notFound():new WebResourceResponse(mime(relative),charset(relative),in);
                    }catch(Exception ignored){return notFound();}
                }
                if(path.startsWith("/zip/")){
                    String rest=path.substring(5),separator=rest.indexOf('/');
                    if(separator<1)return notFound();
                    String archive=rest.substring(0,separator),entry=rest.substring(separator+1);
                    if(!safePath(archive)||archive.contains("/")||!safePath(entry)||!"zip".equals(ext(archive)))return notFound();
                    Uri src; synchronized(fileLock){src=files.get(archive);}
                    if(src==null)return notFound();
                    byte[] data=readZipEntry(src,entry);
                    return data==null?notFound():new WebResourceResponse(mime(entry),charset(entry),new ByteArrayInputStream(data));
                }
                return notFound();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest req){
                if(!req.isForMainFrame())return false;
                Uri u=req.getUrl();
                if("https".equalsIgnoreCase(u.getScheme())&&(HOST.equalsIgnoreCase(u.getHost())||(u.getHost()!=null&&u.getHost().endsWith(APP_SUFFIX))))return false;
                if("file".equalsIgnoreCase(u.getScheme())&&"android_asset".equalsIgnoreCase(u.getHost()))return false;
                if("about".equalsIgnoreCase(u.getScheme()))return false;
                try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}
                return true;
            }
        });
        return w;
    }

    static WebResourceResponse notFound(){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    static String ext(String value){int i=value.lastIndexOf('.');return i<0?"":value.substring(i+1).toLowerCase(Locale.ROOT);}
    static String stem(String value){int i=value.lastIndexOf('.');return (i<0?value:value.substring(0,i)).toLowerCase(Locale.ROOT);}
    static String label(String value){int i=value.lastIndexOf('.');return (i<0?value:value.substring(0,i)).replace('_',' ').replace('-',' ');}
    static String charset(String name){String mime=mime(name);return mime.startsWith("text/")||"application/json".equals(mime)||"image/svg+xml".equals(mime)?"UTF-8":null;}
    static String mime(String name){switch(ext(name)){
        case "html":case "htm":return "text/html";
        case "js":case "mjs":return "text/javascript";
        case "css":return "text/css";
        case "json":case "webmanifest":return "application/json";
        case "wasm":return "application/wasm";
        case "svg":return "image/svg+xml";
        case "png":return "image/png";
        case "jpg":case "jpeg":return "image/jpeg";
        case "webp":return "image/webp";
        case "gif":return "image/gif";
        case "avif":return "image/avif";
        case "mp3":return "audio/mpeg";
        case "ogg":return "audio/ogg";
        case "wav":return "audio/wav";
        case "mp4":return "video/mp4";
        case "woff":return "font/woff";
        case "woff2":return "font/woff2";
        case "txt":return "text/plain";
        default:return "application/octet-stream";
    }}
    static int iconRank(String name){switch(ext(name)){
        case "png":return 0;case "webp":return 1;case "jpg":return 2;case "jpeg":return 3;
        case "svg":return 4;case "gif":return 5;case "avif":return 6;default:return 999;
    }}
    static boolean safePath(String p){
        if(p==null||p.isEmpty()||p.startsWith("/")||p.contains("\\")||p.indexOf('\0')>=0)return false;
        for(String x:p.split("/",-1))if(x.isEmpty()||x.equals(".")||x.equals(".."))return false;
        return true;
    }
    static String pathUrl(String p){return Uri.encode(p,"/");}
    static String appHost(String appId){
        try{
            byte[] digest=MessageDigest.getInstance("SHA-256").digest(appId.getBytes(StandardCharsets.UTF_8));
            StringBuilder out=new StringBuilder("a");
            for(int i=0;i<12;i++)out.append(String.format(Locale.ROOT,"%02x",digest[i]&0xff));
            return out+APP_SUFFIX;
        }catch(Exception ignored){return "a"+Integer.toHexString(appId.hashCode())+APP_SUFFIX;}
    }

    private void scan(){
        List<FileEntry> fresh=new ArrayList<>();
        Map<String,Uri> paths=new HashMap<>();
        if(tree!=null){try{scanChildren(DocumentsContract.getTreeDocumentId(tree),"",fresh,paths,0);}catch(Exception ignored){}}
        synchronized(fileLock){roots.clear();roots.addAll(fresh);files.clear();files.putAll(paths);}
    }
    private void scanChildren(String parent,String prefix,List<FileEntry> fresh,Map<String,Uri> paths,int depth){
        if(depth>8)return;
        Uri children=DocumentsContract.buildChildDocumentsUriUsingTree(tree,parent);
        String[] columns={DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE};
        try(Cursor c=getContentResolver().query(children,columns,null,null,null)){
            if(c==null)return;
            while(c.moveToNext()){
                String id=c.getString(0),name=c.getString(1),type=c.getString(2);
                if(name==null||!safePath(name)||name.contains("/"))continue;
                String relative=prefix+name;
                if(DocumentsContract.Document.MIME_TYPE_DIR.equals(type)){
                    scanChildren(id,relative+"/",fresh,paths,depth+1);
                }else{
                    Uri uri=DocumentsContract.buildDocumentUriUsingTree(tree,id);
                    paths.put(relative,uri);
                    if(depth==0)fresh.add(new FileEntry(name,relative,uri));
                }
            }
        }catch(Exception ignored){}
    }

    private ZipInfo inspectZip(Uri zip){
        ArrayList<String> html=new ArrayList<>(),images=new ArrayList<>();
        try(InputStream input=getContentResolver().openInputStream(zip)){
            if(input==null)return null;
            try(ZipInputStream stream=new ZipInputStream(input)){
                ZipEntry z;int count=0;
                while((z=stream.getNextEntry())!=null&&++count<=MAX_ZIP_ENTRIES){
                    String n=z.getName();
                    if(z.isDirectory()||!safePath(n))continue;
                    String suffix=ext(n);
                    if("html".equals(suffix)||"htm".equals(suffix))html.add(n);
                    if(iconRank(n)<999)images.add(n);
                }
            }
        }catch(Exception ignored){return null;}
        if(html.isEmpty())return null;
        String page=null;
        for(String n:html)if(n.equalsIgnoreCase("index.html")){page=n;break;}
        if(page==null)for(String n:html)if(n.toLowerCase(Locale.ROOT).endsWith("/index.html")&&(page==null||n.length()<page.length()))page=n;
        if(page==null&&html.size()==1)page=html.get(0);
        if(page==null)return null;
        String prefix=page.contains("/")?page.substring(0,page.lastIndexOf('/')+1):"";
        String icon=null;int best=999;
        for(String n:images){
            if(!n.startsWith(prefix))continue;
            String local=n.substring(prefix.length());
            if(local.contains("/"))continue;
            String base=stem(local);
            int rank=iconRank(local)+(base.equals("icon")?0:base.equals("favicon")?10:base.equals("app")?20:base.equals("cover")?30:100);
            if(rank<best){best=rank;icon=n;}
        }
        ZipInfo info=new ZipInfo();info.html=page;info.icon=icon;return info;
    }
    /** Read exactly one ZIP member. No filesystem extraction or mutable shared cache. */
    private byte[] readZipEntry(Uri archive,String wanted){
        try(InputStream input=getContentResolver().openInputStream(archive)){
            if(input==null)return null;
            try(ZipInputStream zip=new ZipInputStream(input)){
                ZipEntry entry;int count=0;
                byte[] buffer=new byte[16384];
                while((entry=zip.getNextEntry())!=null&&++count<=MAX_ZIP_ENTRIES){
                    if(entry.isDirectory()||!safePath(entry.getName())||!entry.getName().equals(wanted))continue;
                    if(entry.getSize()>MAX_ENTRY_BYTES)return null;
                    ByteArrayOutputStream bytes=new ByteArrayOutputStream();
                    int read;
                    while((read=zip.read(buffer))!=-1){if(bytes.size()+read>MAX_ENTRY_BYTES)return null;bytes.write(buffer,0,read);}
                    return bytes.toByteArray();
                }
            }
        }catch(Exception ignored){}
        return null;
    }
    private String catalog(){
        scan();
        List<FileEntry> listing;
        synchronized(fileLock){listing=new ArrayList<>(roots);}
        Map<String,FileEntry> icons=new HashMap<>();
        for(FileEntry file:listing)if(iconRank(file.name)<999){
            String key=stem(file.name);
            FileEntry prev=icons.get(key);
            if(prev==null||iconRank(file.name)<iconRank(prev.name))icons.put(key,file);
        }
        ArrayList<AppEntry> found=new ArrayList<>();
        for(FileEntry file:listing){
            String extension=ext(file.name);
            if(extension.equals("html")||extension.equals("htm")){
                FileEntry icon=icons.get(stem(file.name));
                String id="loose:"+file.name,host=appHost(id);
                found.add(new AppEntry(id,label(file.name),"https://"+host+"/"+pathUrl(file.path),icon==null?"":ORIGIN+"/files/"+pathUrl(icon.path),host));
            }else if(extension.equals("zip")){
                ZipInfo zip=inspectZip(file.uri);
                if(zip==null)continue;
                FileEntry icon=icons.get(stem(file.name));
                String base=ORIGIN+"/zip/"+Uri.encode(file.name)+"/";
                String id="zip:"+file.name,host=appHost(id);
                found.add(new AppEntry(id,label(file.name),"https://"+host+"/"+pathUrl(zip.html),icon!=null?ORIGIN+"/files/"+pathUrl(icon.path):zip.icon!=null?base+pathUrl(zip.icon):"",host));
            }
        }
        found.sort(Comparator.comparing((AppEntry a)->a.label.toLowerCase(Locale.ROOT)).thenComparing(a->a.id));
        JSONArray out=new JSONArray();
        synchronized(fileLock){apps.clear();appHosts.clear();for(AppEntry a:found){apps.put(a.id,a);appHosts.put(a.host,a);}}
        for(AppEntry a:found)try{
            JSONObject data=new JSONObject();data.put("id",a.id);data.put("label",a.label);data.put("iconUrl",a.iconUrl);out.put(data);
        }catch(Exception ignored){}
        return out.toString();
    }
    private final class Bridge{
        @JavascriptInterface public String listApps(){return catalog();}
        @JavascriptInterface public String folderName(){return tree==null?"No folder selected":"Connected Android folder";}
        @JavascriptInterface public void chooseFolder(){runOnUiThread(()->{
            Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            startActivityForResult(intent,PICK_DIRECTORY);
        });}
        @JavascriptInterface public void launchApp(String id){
            AppEntry app; synchronized(fileLock){app=apps.get(id);}
            if(app!=null)runOnUiThread(()->openNative(app.url));
        }
    }
    private void openNative(String url){
        if(opened!=null)closeNative();
        opened=newWebView(false);
        root.addView(opened,new FrameLayout.LayoutParams(-1,-1));
        opened.loadUrl(url);
    }
    private void closeNative(){
        if(opened==null)return;
        WebView previous=opened;opened=null;
        root.removeView(previous);previous.stopLoading();previous.loadUrl("about:blank");previous.destroy();
        home.evaluateJavascript("window.onNativeAppReturned&&window.onNativeAppReturned()",null);
    }
    @Override public void onBackPressed(){
        if(opened!=null){if(opened.canGoBack())opened.goBack();else closeNative();return;}
        if(home!=null&&home.canGoBack()){home.goBack();return;}
        super.onBackPressed();
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==PICK_FILE){
            if(pendingFiles!=null){pendingFiles.onReceiveValue(result==RESULT_OK?WebChromeClient.FileChooserParams.parseResult(result,data):null);pendingFiles=null;}
            return;
        }
        if(request==PICK_DIRECTORY&&result==RESULT_OK&&data!=null&&data.getData()!=null){
            Uri chosen=data.getData();
            try{
                getContentResolver().takePersistableUriPermission(chosen,Intent.FLAG_GRANT_READ_URI_PERMISSION);
                tree=chosen;
                getSharedPreferences(STORE,MODE_PRIVATE).edit().putString(URI_KEY,chosen.toString()).apply();
                home.evaluateJavascript("window.onNativeCatalogChanged&&window.onNativeCatalogChanged()",null);
            }catch(Exception ignored){}
        }
    }
    @Override protected void onResume(){super.onResume();if(home!=null&&opened==null){home.postDelayed(()->home.evaluateJavascript("window.onNativeCatalogChanged&&window.onNativeCatalogChanged()",null),300);}}
    @Override protected void onDestroy(){if(pendingFiles!=null){pendingFiles.onReceiveValue(null);pendingFiles=null;}if(opened!=null){opened.destroy();opened=null;}if(home!=null){home.destroy();home=null;}super.onDestroy();}
}
