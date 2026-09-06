package __PACKAGE_NAME__;

import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.os.Build;
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
    private static final String PREFS_NAME = "conductor_native_state";
    private static final String PREF_VERSION_CODE = "last_web_bundle_version_code";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.rgb(7, 10, 18));
        getWindow().setNavigationBarColor(Color.rgb(7, 10, 18));
        super.onCreate(savedInstanceState);
        refreshBundledUiAfterUpgrade();
        applySystemBarInsets();
    }

    private long currentVersionCode() throws Exception {
        final PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return info.getLongVersionCode();
        return info.versionCode;
    }

    private void refreshBundledUiAfterUpgrade() {
        final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;

        try {
            final long currentVersion = currentVersionCode();
            final SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            final long previousVersion = prefs.getLong(PREF_VERSION_CODE, -1L);
            if (previousVersion == currentVersion) return;

            prefs.edit().putLong(PREF_VERSION_CODE, currentVersion).apply();
            webView.postDelayed(() -> {
                webView.clearCache(true);
                webView.clearHistory();
                webView.reload();
            }, 120L);
        } catch (Exception ignored) {
            webView.clearCache(true);
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
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            }

            return windowInsets;
        });

        ViewCompat.requestApplyInsets(webView);
    }
}
