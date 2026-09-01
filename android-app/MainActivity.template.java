package __PACKAGE_NAME__;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        getWindow().setStatusBarColor(Color.rgb(7, 10, 18));
        getWindow().setNavigationBarColor(Color.rgb(7, 10, 18));
        super.onCreate(savedInstanceState);
        applySystemBarInsets();
    }

    private void applySystemBarInsets() {
        final View webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return;

        webView.setOnApplyWindowInsetsListener((view, insets) -> {
            final int statusBarTop = insets.getSystemWindowInsetTop();
            view.setPadding(
                view.getPaddingLeft(),
                statusBarTop,
                view.getPaddingRight(),
                view.getPaddingBottom()
            );
            return insets;
        });
        webView.requestApplyInsets();
    }
}
