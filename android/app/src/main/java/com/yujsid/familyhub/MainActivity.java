package com.yujsid.familyhub;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private int statusBarTopCssPx;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FamilyHubWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            int top = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
            float density = getResources().getDisplayMetrics().density;
            statusBarTopCssPx = density > 0 ? Math.round(top / density) : 0;
            publishStatusBarInset();
            return insets;
        });
        ViewCompat.requestApplyInsets(decor);
        if (getBridge() != null) {
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    publishStatusBarInset();
                }
            });
        }
    }

    private void publishStatusBarInset() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView web = getBridge().getWebView();
        String js = "document.documentElement.style.setProperty('--status-bar-top','" + statusBarTopCssPx + "px')";
        web.post(() -> web.evaluateJavascript(js, null));
    }
}
