package __PACKAGE_NAME__;

import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String RUNTIME_PREFS = "conductor_runtime";
    private static final String WEB_CACHE_VERSION_KEY = "web_cache_version";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Android 15+ enforces edge-to-edge for modern target SDKs. We deliberately
        // receive the system-bar insets and shrink the WebView to the safe rectangle,
        // so neither the status bar nor the navigation/gesture area can cover the app UI.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.rgb(7, 10, 18));
        getWindow().setNavigationBarColor(Color.rgb(7, 10, 18));
        super.onCreate(savedInstanceState);
        refreshWebAssetsForInstalledVersion();
        applySystemBarInsets();
    }

    private void refreshWebAssetsForInstalledVersion() {
        final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;

        try {
            final String versionName = getPackageManager()
                .getPackageInfo(getPackageName(), 0)
                .versionName;
            final SharedPreferences prefs = getSharedPreferences(RUNTIME_PREFS, MODE_PRIVATE);
            final String cachedVersion = prefs.getString(WEB_CACHE_VERSION_KEY, "");

            if (!versionName.equals(cachedVersion)) {
                // The app renders the live conductor.kz/mobile UI. WebView keeps HTTP and
                // module caches across APK upgrades, which can leave an old interface in a
                // newly installed build. Clear it once per APK version and reload so the
                // first launch after update is guaranteed to use the current website code.
                webView.clearCache(true);
                webView.clearHistory();
                prefs.edit().putString(WEB_CACHE_VERSION_KEY, versionName).apply();
                webView.reload();
            }
        } catch (Exception ignored) {
            // A cache refresh is a safety mechanism, not a reason to block app startup.
        }
    }

    private void applySystemBarInsets() {
        final View webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;

        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            final Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );

            final ViewGroup.LayoutParams rawParams = view.getLayoutParams();
            if (rawParams instanceof ViewGroup.MarginLayoutParams) {
                final ViewGroup.MarginLayoutParams params = (ViewGroup.MarginLayoutParams) rawParams;
                if (params.leftMargin != bars.left
                    || params.topMargin != bars.top
                    || params.rightMargin != bars.right
                    || params.bottomMargin != bars.bottom) {
                    params.leftMargin = bars.left;
                    params.topMargin = bars.top;
                    params.rightMargin = bars.right;
                    params.bottomMargin = bars.bottom;
                    view.setLayoutParams(params);
                }
            } else {
                // Fallback for an unexpected parent layout: padding still keeps content
                // out of the system bars instead of allowing overlap.
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            }

            return windowInsets;
        });

        ViewCompat.requestApplyInsets(webView);
    }
}
