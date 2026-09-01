package __PACKAGE_NAME__;

import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.ValueAnimator;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final long SPLASH_HOLD_MS = 6200L;
    private static final long SPLASH_FADE_MS = 650L;

    private FrameLayout splashRoot;
    private int previousSystemUiVisibility;
    private int previousStatusBarColor;
    private int previousNavigationBarColor;
    private int previousWindowFlags;
    private boolean returningFromBackground;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showWarehouseSplash();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (returningFromBackground && splashRoot == null) showWarehouseSplash();
        returningFromBackground = false;
    }

    @Override
    public void onPause() {
        returningFromBackground = true;
        super.onPause();
    }

    private float dp(float value) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }

    private void showWarehouseSplash() {
        if (splashRoot != null) return;

        previousSystemUiVisibility = getWindow().getDecorView().getSystemUiVisibility();
        previousStatusBarColor = getWindow().getStatusBarColor();
        previousNavigationBarColor = getWindow().getNavigationBarColor();
        previousWindowFlags = getWindow().getAttributes().flags;

        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().setStatusBarColor(Color.rgb(7, 10, 18));
        getWindow().setNavigationBarColor(Color.rgb(7, 10, 18));
        getWindow().getDecorView().setSystemUiVisibility(
            previousSystemUiVisibility
                & ~View.SYSTEM_UI_FLAG_FULLSCREEN
                & ~View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                & ~View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                & ~View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                & ~View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        );

        splashRoot = new FrameLayout(this);
        splashRoot.setBackgroundColor(Color.rgb(7, 10, 18));
        splashRoot.setClickable(true);
        splashRoot.setFocusable(true);

        ImageView locomotive = new ImageView(this);
        locomotive.setImageResource(R.drawable.warehouse_splash);
        locomotive.setScaleType(ImageView.ScaleType.CENTER_CROP);
        locomotive.setBackgroundColor(Color.rgb(7, 10, 18));
        splashRoot.addView(locomotive, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        SmokeView smoke = new SmokeView();
        splashRoot.addView(smoke, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        HeadlightView headlight = new HeadlightView();
        splashRoot.addView(headlight, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        ShimmerTextView title = new ShimmerTextView();
        title.setText("CONDUCTOR.KZ");
        title.setGravity(Gravity.CENTER);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 36);
        title.setTypeface(android.graphics.Typeface.create("serif", android.graphics.Typeface.BOLD));
        title.setLetterSpacing(0.045f);
        title.setShadowLayer(dp(4), 0, dp(2), Color.BLACK);
        FrameLayout.LayoutParams titleParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            (int) dp(78),
            Gravity.BOTTOM
        );
        titleParams.leftMargin = (int) dp(34);
        titleParams.rightMargin = (int) dp(34);
        titleParams.bottomMargin = (int) dp(34);
        splashRoot.addView(title, titleParams);

        addContentView(splashRoot, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        splashRoot.bringToFront();

        PropertyValuesHolder scaleX = PropertyValuesHolder.ofFloat("scaleX", 1.00f, 1.13f);
        PropertyValuesHolder scaleY = PropertyValuesHolder.ofFloat("scaleY", 1.00f, 1.13f);
        PropertyValuesHolder translateY = PropertyValuesHolder.ofFloat("translationY", 0f, dp(18));
        ObjectAnimator driveIn = ObjectAnimator.ofPropertyValuesHolder(locomotive, scaleX, scaleY, translateY);
        driveIn.setInterpolator(new DecelerateInterpolator(0.9f));
        driveIn.setDuration(5900L);
        driveIn.start();

        title.startShimmer();
        headlight.startPulse();

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (splashRoot == null) return;
            splashRoot.animate()
                .alpha(0f)
                .setDuration(SPLASH_FADE_MS)
                .withEndAction(() -> {
                    if (splashRoot != null && splashRoot.getParent() instanceof ViewGroup) {
                        ((ViewGroup) splashRoot.getParent()).removeView(splashRoot);
                    }
                    splashRoot = null;
                    getWindow().getDecorView().setSystemUiVisibility(previousSystemUiVisibility);
                    getWindow().setStatusBarColor(previousStatusBarColor);
                    getWindow().setNavigationBarColor(previousNavigationBarColor);
                    if ((previousWindowFlags & WindowManager.LayoutParams.FLAG_FULLSCREEN) != 0) {
                        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                    }
                })
                .start();
        }, SPLASH_HOLD_MS);
    }

    private class SmokeView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final long start = SystemClock.uptimeMillis();

        SmokeView() {
            super(MainActivity.this);
            setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            long elapsed = SystemClock.uptimeMillis() - start;
            float originX = getWidth() * 0.50f;
            float originY = getHeight() * 0.285f;

            for (int i = 0; i < 26; i++) {
                float phase = ((elapsed + i * 185L) % 3900L) / 3900f;
                float side = (i % 2 == 0 ? -1f : 1f);
                float drift = side * phase * getWidth() * (0.08f + (i % 5) * 0.012f);
                drift += (float) Math.sin((phase * 6.283f) + i) * getWidth() * 0.025f;
                float x = originX + drift;
                float y = originY - phase * getHeight() * 0.27f;
                float radius = dp(12) + phase * dp(58);
                int alpha = Math.max(0, (int) (90 * (1f - phase)));
                int base = i % 3;
                int color = base == 0 ? Color.rgb(26, 146, 255)
                    : base == 1 ? Color.rgb(235, 32, 175)
                    : Color.rgb(131, 54, 255);
                paint.setShader(new RadialGradient(
                    x, y, radius,
                    new int[] {
                        Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color)),
                        Color.TRANSPARENT
                    },
                    new float[] { 0f, 1f },
                    Shader.TileMode.CLAMP
                ));
                canvas.drawCircle(x, y, radius, paint);
            }
            paint.setShader(null);
            postInvalidateOnAnimation();
        }
    }

    private class HeadlightView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private float pulse = 0.55f;

        HeadlightView() {
            super(MainActivity.this);
            setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        }

        void startPulse() {
            ValueAnimator animator = ValueAnimator.ofFloat(0.42f, 0.9f, 0.5f);
            animator.setDuration(1650L);
            animator.setRepeatCount(ValueAnimator.INFINITE);
            animator.setInterpolator(new LinearInterpolator());
            animator.addUpdateListener(a -> {
                pulse = (float) a.getAnimatedValue();
                invalidate();
            });
            animator.start();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float x = getWidth() * 0.50f;
            float y = getHeight() * 0.385f;
            float radius = dp(36) + dp(11) * pulse;
            int alpha = (int) (110 * pulse);
            paint.setShader(new RadialGradient(
                x, y, radius,
                new int[] {
                    Color.argb(alpha, 255, 214, 112),
                    Color.argb(alpha / 3, 255, 128, 24),
                    Color.TRANSPARENT
                },
                new float[] { 0f, 0.42f, 1f },
                Shader.TileMode.CLAMP
            ));
            canvas.drawCircle(x, y, radius, paint);
            paint.setShader(null);
        }
    }

    private class ShimmerTextView extends TextView {
        private final Matrix shaderMatrix = new Matrix();
        private LinearGradient shimmer;
        private float shimmerX;

        ShimmerTextView() {
            super(MainActivity.this);
            setTextColor(Color.rgb(201, 139, 56));
            setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        }

        void startShimmer() {
            post(() -> {
                float band = dp(90);
                shimmer = new LinearGradient(
                    -band, 0, band, 0,
                    new int[] {
                        Color.rgb(177, 111, 34),
                        Color.rgb(226, 174, 82),
                        Color.WHITE,
                        Color.rgb(244, 196, 101),
                        Color.rgb(177, 111, 34)
                    },
                    new float[] { 0f, .34f, .5f, .66f, 1f },
                    Shader.TileMode.CLAMP
                );
                getPaint().setShader(shimmer);
                ValueAnimator animator = ValueAnimator.ofFloat(-getWidth() * 0.25f, getWidth() * 1.25f);
                animator.setDuration(2200L);
                animator.setStartDelay(450L);
                animator.setRepeatCount(ValueAnimator.INFINITE);
                animator.setRepeatMode(ValueAnimator.RESTART);
                animator.setInterpolator(new LinearInterpolator());
                animator.addUpdateListener(a -> {
                    shimmerX = (float) a.getAnimatedValue();
                    invalidate();
                });
                animator.start();
            });
        }

        @Override
        protected void onDraw(Canvas canvas) {
            if (shimmer != null) {
                shaderMatrix.setTranslate(shimmerX, 0f);
                shimmer.setLocalMatrix(shaderMatrix);
            }
            super.onDraw(canvas);
        }
    }
}
