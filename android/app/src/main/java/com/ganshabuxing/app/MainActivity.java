package com.ganshabuxing.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.CalendarContract;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.json.JSONArray;
import org.json.JSONObject;

/** Bundled UI with a narrowly scoped bridge; external pages cannot load here. */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "appassets.androidplatform.net";
    private static final Set<String> FILES = new java.util.HashSet<>(java.util.Arrays.asList("home.html", "styles.css", "settings.css", "appui.css", "app.js", "goals.js", "store.js", "transport.js"));
    private final ExecutorService executor = Executors.newFixedThreadPool(2);
    private final ConcurrentHashMap<String, Future<?>> jobs = new ConcurrentHashMap<>();
    private WebView web;
    private SecureSettings settings;
    private DeepSeekClient client;
    private String permissionRequest;
    private String pendingExport;
    private final String settingsToken = java.util.UUID.randomUUID().toString();
    @android.annotation.SuppressLint("SetJavaScriptEnabled") // Trusted bundled UI only; external navigation and network resources are blocked.
    @Override public void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        settings = new SecureSettings(this);
        try (InputStream input = getAssets().open("system-prompt.txt")) {
            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[8192]; int read;
            while ((read = input.read(buffer)) != -1) bytes.write(buffer, 0, read);
            client = new DeepSeekClient(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
        } catch (Exception error) { Toast.makeText(this, "应用文件缺失，请重新安装。", Toast.LENGTH_LONG).show(); finish(); return; }
        web = new WebView(this);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings options = web.getSettings();
        options.setJavaScriptEnabled(true); options.setDomStorageEnabled(true);
        options.setAllowFileAccess(false); options.setAllowContentAccess(false);
        options.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        options.setSupportMultipleWindows(false); options.setJavaScriptCanOpenWindowsAutomatically(false);
        options.setSaveFormData(false); options.setMediaPlaybackRequiresUserGesture(true);
        web.setImportantForAutofill(android.view.View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        web.addJavascriptInterface(new Bridge(), "GanshaNative");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isLocal(request.getUrl());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!isLocal(uri)) return blocked();
                String name = uri.getPath();
                if (name == null || name.equals("/")) name = "home.html"; else name = name.substring(1);
                if (!FILES.contains(name)) return blocked();
                String mime = name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : "text/html";
                try {
                    Map<String, String> headers = new java.util.HashMap<>();
                    headers.put("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'none'");
                    headers.put("Cache-Control", "no-store"); headers.put("X-Content-Type-Options", "nosniff");
                    return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, getAssets().open("web/" + name));
                } catch (Exception error) { return blocked(); }
            }
        });
        web.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(web);
        web.loadUrl("https://" + ORIGIN + "/home.html");
    }
    private boolean isLocal(Uri uri) { return "https".equals(uri.getScheme()) && ORIGIN.equals(uri.getHost()) && uri.getPort() == -1; }
    private WebResourceResponse blocked() { return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", new java.util.HashMap<>(), new ByteArrayInputStream(new byte[0])); }
    private void reply(String id, int status, JSONObject data) {
        runOnUiThread(() -> {
            if (web != null && !isFinishing() && !isDestroyed()) web.evaluateJavascript("window.__ganshaReply(" + JSONObject.quote(id) + "," + status + "," + data + ")", null);
        });
    }
    private void error(String id, int status, String code, String message) {
        try { reply(id, status, new JSONObject().put("error", new JSONObject().put("code", code).put("message", message))); } catch (Exception ignored) { }
    }
    private JSONObject credentialCandidate(JSONObject body) throws Exception {
        String key = body.optString("apiKey", "").trim();
        if (key.isEmpty()) key = settings.apiKey();
        String model = body.has("model") ? body.getString("model").trim() : settings.model();
        if (!key.matches("[A-Za-z0-9._-]{16,512}") || !model.matches("[A-Za-z0-9._-]{1,100}"))
            throw new AnalysisValidator.Failure(400, "INVALID_SETTINGS", "请填写正确的密钥和模型名称。");
        return new JSONObject().put("key", key).put("model", model);
    }
    private JSONObject dispatch(String id, String path, String method, JSONObject body) throws Exception {
        if (path.equals("/api/v1/health") && method.equals("GET")) return new JSONObject().put("status", "ok").put("configured", !settings.apiKey().isEmpty()).put("model", settings.model()).put("settingsAvailable", true);
        if (path.equals("/api/v1/settings/deepseek") && method.equals("GET")) return new JSONObject().put("configured", !settings.apiKey().isEmpty()).put("model", settings.model()).put("csrfToken", settingsToken);
        if (!method.equals("POST")) throw new AnalysisValidator.Failure(405, "METHOD_NOT_ALLOWED", "此操作需要确认后提交。");
        switch (path) {
            case "/api/v1/settings/deepseek": {
                JSONObject candidate = credentialCandidate(body);
                settings.save(candidate.getString("key"), candidate.getString("model"));
                return new JSONObject().put("configured", true).put("model", candidate.getString("model")).put("message", "密钥已加密保存并立即生效。");
            }
            case "/api/v1/settings/deepseek/test": {
                JSONObject candidate = credentialCandidate(body);
                return client.test(id, candidate.getString("key"), candidate.getString("model"));
            }
            case "/api/v1/plans/analyze": return client.analyze(id, body, settings.apiKey(), settings.model());
            case "/native/reminders": Reminders.sync(this, body.getJSONArray("tasks")); return new JSONObject().put("saved", true);
            case "/native/notifications": {
                runOnUiThread(() -> {
                    boolean granted = getSystemService(NotificationManager.class).areNotificationsEnabled();
                    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        if (permissionRequest != null) { error(id, 409, "PERMISSION_PENDING", "请先处理系统通知授权。"); return; }
                        permissionRequest = id; requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 40);
                    } else {
                        try { reply(id, 200, new JSONObject().put("granted", granted)); } catch (Exception ignored) { }
                        if (!granted) Toast.makeText(this, "请在系统设置中允许干啥不行发送通知。", Toast.LENGTH_LONG).show();
                    }
                });
                return null;
            }
            case "/native/calendar": {
                String title = AnalysisValidator.text(body, "title", 300), description = AnalysisValidator.text(body, "description", 2000);
                long start = body.getLong("start"), end = body.getLong("end");
                if (start <= 0 || end <= start) throw new IllegalArgumentException();
                runOnUiThread(() -> {
                    Intent calendar = new Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI)
                        .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start).putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end)
                        .putExtra(CalendarContract.Events.TITLE, title).putExtra(CalendarContract.Events.DESCRIPTION, description);
                    try { startActivity(calendar); reply(id, 200, new JSONObject().put("opened", true)); }
                    catch (ActivityNotFoundException error) { error(id, 404, "NO_CALENDAR", "未找到日历应用。"); }
                    catch (Exception error) { error(id, 500, "CALENDAR_FAILED", "日历暂时无法打开。"); }
                }); return null;
            }
            case "/native/export": {
                String content = body.getString("content");
                runOnUiThread(() -> {
                    if (pendingExport != null) { error(id, 409, "EXPORT_PENDING", "请先完成当前导出。"); return; }
                    pendingExport = content;
                    Intent export = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE, "干啥不行-记录.json");
                    try { startActivityForResult(export, 41); reply(id, 200, new JSONObject().put("opened", true)); }
                    catch (Exception error) { pendingExport = null; error(id, 500, "EXPORT_FAILED", "文件保存位置暂时无法打开。"); }
                }); return null;
            }
            default: throw new AnalysisValidator.Failure(404, "NOT_FOUND", "未找到这个操作。");
        }
    }
    private final class Bridge {
        @JavascriptInterface public void request(String id, String path, String method, String body) {
            if (id == null || !id.matches("[0-9]{1,12}") || path == null || method == null || body == null || body.length() > 4 * 1024 * 1024) return;
            if (path.equals("/api/v1/plans/analyze") && body.length() > 16384) { error(id, 413, "REQUEST_TOO_LARGE", "请精简目标和补充信息。"); return; }
            java.util.concurrent.FutureTask<Void> job = new java.util.concurrent.FutureTask<>(() -> {
                try { JSONObject response = dispatch(id, path, method, new JSONObject(body)); if (response != null) reply(id, 200, response); }
                catch (AnalysisValidator.Failure failure) { error(id, failure.status, failure.code, failure.getMessage()); }
                catch (Exception failure) { error(id, 502, "OPERATION_FAILED", "操作暂时未完成，请检查连接后重试。密钥不会显示在错误信息中。"); }
                finally { jobs.remove(id); }
                return null;
            });
            jobs.put(id, job);
            executor.execute(job);
        }
        @JavascriptInterface public void cancel(String id) { client.cancel(id); Future<?> job = jobs.remove(id); if (job != null) job.cancel(true); }
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == 40 && permissionRequest != null) {
            String id = permissionRequest; permissionRequest = null;
            try { reply(id, 200, new JSONObject().put("granted", results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED)); } catch (Exception ignored) { }
        }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != 41) return;
        String content = pendingExport; pendingExport = null;
        if (result != RESULT_OK || data == null || data.getData() == null || content == null) return;
        Uri uri = data.getData();
        executor.submit(() -> {
            String message = "记录已导出。";
            try (java.io.OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new IllegalStateException(); out.write(content.getBytes(StandardCharsets.UTF_8));
            } catch (Exception error) { message = "导出失败，请重试或选择其他位置。"; }
            final String text = message; runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_LONG).show());
        });
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("(function(){const d=document.querySelector('dialog[open]');if(d){d.close();return true;}return false;})()", value -> { if (!"true".equals(value)) finish(); });
    }
    @Override protected void onDestroy() {
        if (client != null) client.close();
        executor.shutdownNow();
        if (web != null) { web.removeJavascriptInterface("GanshaNative"); web.destroy(); web = null; }
        super.onDestroy();
    }
}
