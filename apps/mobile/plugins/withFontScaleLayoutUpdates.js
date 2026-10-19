// Expo config plugin: complete Android font-scale handling for React Native 0.81.x (new architecture).
//
// withFontScaleConfigChange (separate plugin) stops Android from relaunching MainActivity on a text-size change.
// That alone left live text sizes inconsistent (some text re-rendered at the new size, the rest and the layout
// boxes kept the old one), headers and tabs clipped, and the composer could move behind the keyboard, because
// React Native only reacts to a font-scale change behind a feature flag that is off by default:
//   - ReactHostImpl.onConfigurationChanged refreshes DisplayMetricsHolder (text size source on Android),
//   - ReactSurfaceImpl.getFontScale puts the live scale into the surface layout context,
//   - SurfaceHandler::constraintLayout re-dirties every measurable node when that scale changes,
//   - ReactEditText re-applies its text attributes,
// all guarded by ReactNativeFeatureFlags.enableFontScaleChangesUpdatingLayout() (default false, no public switch).
//
// Even with that flag on, a Gradle debug build instrumented on the SM-S711U showed the layout reverting: the native
// tree re-measures every text node and the views reach the new size, but the next React commit (any state change,
// e.g. the safe-area insets event ~100 ms later) installs React's own node instances for all subtrees it did not
// touch. Those were never re-measured, so the mount layer resets their views to the old size without any layout
// event reaching JS. The fix therefore has a JS half: utils/fontScaleRelayout.ts makes every Text/TextInput
// re-commit (with a prop that changes per font-scale epoch) after the surface has been laid out with the new scale.
//
// This plugin generates three native changes:
//   1. FontScaleLayout.kt: turns that flag on with ReactNativeFeatureFlags.dangerouslyForceOverride, RN's API for an
//      app that must change flags after DefaultNewArchitectureEntryPoint.load(). The provider delegates every other
//      flag to the exact provider load() installed for the app's release level, so defaults are unchanged; it is the
//      only call of its kind (no second plain override, which RN rejects).
//   2. MainApplication.kt: one call right after RN's generated loadReactNative(this) and before any other flag read.
//   3. MainActivity.kt: onConfigurationChanged forwards to RN (super); when the font scale really changed it requests
//      a relayout of the React surface and, once that layout pass is done, emits "fontScaleChanged" to JS.
const { withMainApplication, withMainActivity, withDangerousMod, AndroidConfig } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const CALL = 'FontScaleLayout.enableFontScaleLayoutUpdates()';

function patchMainApplication(src) {
  if (src.includes(CALL)) return src;
  const m = src.match(/^([ \t]*)loadReactNative\(this\)[ \t]*\r?\n/m);
  if (!m) throw new Error('withFontScaleLayoutUpdates: loadReactNative(this) not found in MainApplication.kt (template changed?)');
  const at = m.index + m[0].length;
  return `${src.slice(0, at)}${m[1]}${CALL}\n${src.slice(at)}`;
}

const OVERRIDE = `  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    // fontScale is handled here instead of relaunching the activity; make React re-measure with the new scale.
    FontScaleLayout.relayoutReactSurface(this, newConfig)
  }
`;

function patchMainActivity(src) {
  if (src.includes('FontScaleLayout.relayoutReactSurface(this, newConfig)')) return src;
  const cls = src.match(/^class MainActivity : ReactActivity\(\) \{[ \t]*\r?\n/m);
  if (!cls) throw new Error('withFontScaleLayoutUpdates: class MainActivity : ReactActivity() not found in MainActivity.kt (template changed?)');
  let out = `${src.slice(0, cls.index + cls[0].length)}${OVERRIDE}\n${src.slice(cls.index + cls[0].length)}`;
  if (!/^import android\.content\.res\.Configuration$/m.test(out)) {
    out = out.replace(/^(package [^\n]+\n)/m, '$1import android.content.res.Configuration\n');
  }
  return out;
}

function helperSource(pkg) {
  return `package ${pkg}

import android.content.res.Configuration
import android.content.res.Resources
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.ViewTreeObserver
import android.view.WindowInsets
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Canary_Android
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Experimental_Android
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsProvider
import com.facebook.react.uimanager.PixelUtil

/** Generated by plugins/withFontScaleLayoutUpdates.js. Every flag but one is delegated to React Native's own provider. */
internal class FontScaleLayoutFlags(base: ReactNativeFeatureFlagsProvider) : ReactNativeFeatureFlagsProvider by base {
  override fun enableFontScaleChangesUpdatingLayout(): Boolean = true
}

object FontScaleLayout {
  private const val TAG = "FontScaleLayout"

  /** Must match FONT_SCALE_CHANGED_EVENT in utils/fontScaleRelayout.ts. */
  private const val FONT_SCALE_CHANGED_EVENT = "fontScaleChanged"

  private var lastFontScale: Float = Resources.getSystem().configuration.fontScale

  /**
   * Call once in Application.onCreate right after loadReactNative(this). Rebuilds the provider that
   * DefaultNewArchitectureEntryPoint.load() installed for the current release level (same classes and
   * arguments) and swaps it for one that also enables font-scale layout updates.
   */
  fun enableFontScaleLayoutUpdates() {
    val base: ReactNativeFeatureFlagsProvider = when (DefaultNewArchitectureEntryPoint.releaseLevel) {
      ReleaseLevel.EXPERIMENTAL -> ReactNativeFeatureFlagsOverrides_RNOSS_Experimental_Android()
      ReleaseLevel.CANARY -> ReactNativeFeatureFlagsOverrides_RNOSS_Canary_Android()
      ReleaseLevel.STABLE -> ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android(true, true, true)
    }
    val accessed = ReactNativeFeatureFlags.dangerouslyForceOverride(FontScaleLayoutFlags(base))
    if (accessed != null) {
      Log.w(TAG, "feature flags were read before the font-scale override: $accessed")
    }
  }

  /**
   * Call from MainActivity.onConfigurationChanged after super (React Native has refreshed its metrics by then).
   * When the font scale really changed: ask the React surface to measure again (it only does so when asked or
   * when its size changes) and, once that layout pass is done, tell JS so React re-commits its text nodes.
   * Emitting earlier would let React commit before the surface carries the new scale.
   */
  fun relayoutReactSurface(activity: ReactActivity, newConfig: Configuration) {
    if (newConfig.fontScale == lastFontScale) return
    lastFontScale = newConfig.fontScale
    val root = activity.reactDelegate?.reactRootView ?: return
    root.requestLayout()
    root.viewTreeObserver.addOnGlobalLayoutListener(object : ViewTreeObserver.OnGlobalLayoutListener {
      override fun onGlobalLayout() {
        if (root.viewTreeObserver.isAlive) root.viewTreeObserver.removeOnGlobalLayoutListener(this)
        (activity.application as? ReactApplication)?.reactHost?.currentReactContext?.emitDeviceEvent(FONT_SCALE_CHANGED_EVENT)
      }
    })
    // The keyboard re-inflates itself on a font-scale change and the window insets pass through transient states
    // (IME hidden, system bars 0) before settling about half a second later. React Native computes its
    // keyboardDidShow payload once, in whichever state it catches, and KeyboardAvoidingView pads the composer from it.
    // Re-send the settled values so the composer ends up above the keyboard.
    val handler = Handler(Looper.getMainLooper())
    for (delay in KEYBOARD_SETTLE_DELAYS_MS) handler.postDelayed({ reemitKeyboardMetrics(activity) }, delay)
  }

  private val KEYBOARD_SETTLE_DELAYS_MS = longArrayOf(700L, 1600L)

  /** Same inputs and payload as ReactRootView.checkForKeyboardEvents, evaluated on the settled window insets. */
  private fun reemitKeyboardMetrics(activity: ReactActivity) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || activity.isFinishing || activity.isDestroyed) return
    val rootView = activity.window.decorView
    val insets = rootView.rootWindowInsets ?: return
    if (!insets.isVisible(WindowInsets.Type.ime())) return
    val visible = Rect()
    rootView.getWindowVisibleDisplayFrame(visible)
    val height = insets.getInsets(WindowInsets.Type.ime()).bottom - insets.getInsets(WindowInsets.Type.systemBars()).bottom
    val softInputMode = (rootView.layoutParams as? WindowManager.LayoutParams)?.softInputMode ?: return
    val screenY = if (softInputMode == WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING) visible.bottom - height else visible.bottom
    val endCoordinates = Arguments.createMap().apply {
      putDouble("height", PixelUtil.toDIPFromPixel(height.toFloat()).toDouble())
      putDouble("screenX", PixelUtil.toDIPFromPixel(visible.left.toFloat()).toDouble())
      putDouble("width", PixelUtil.toDIPFromPixel(visible.width().toFloat()).toDouble())
      putDouble("screenY", PixelUtil.toDIPFromPixel(screenY.toFloat()).toDouble())
    }
    val params = Arguments.createMap().apply {
      putMap("endCoordinates", endCoordinates)
      putString("easing", "keyboard")
      putDouble("duration", 0.0)
    }
    (activity.application as? ReactApplication)?.reactHost?.currentReactContext?.emitDeviceEvent("keyboardDidShow", params)
  }
}
`;
}

function helperPath(platformProjectRoot, pkg) {
  return path.join(platformProjectRoot, 'app', 'src', 'main', 'java', ...pkg.split('.'), 'FontScaleLayout.kt');
}

function withFontScaleLayoutUpdates(config) {
  config = withMainApplication(config, (c) => {
    c.modResults.contents = patchMainApplication(c.modResults.contents);
    return c;
  });
  config = withMainActivity(config, (c) => {
    c.modResults.contents = patchMainActivity(c.modResults.contents);
    return c;
  });
  return withDangerousMod(config, ['android', async (c) => {
    const pkg = AndroidConfig.Package.getPackage(c);
    if (!pkg) throw new Error('withFontScaleLayoutUpdates: android.package is not set');
    const file = helperPath(c.modRequest.platformProjectRoot, pkg);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, helperSource(pkg));
    return c;
  }]);
}

module.exports = withFontScaleLayoutUpdates;
module.exports.default = withFontScaleLayoutUpdates;
module.exports.patchMainApplication = patchMainApplication;
module.exports.patchMainActivity = patchMainActivity;
module.exports.helperSource = helperSource;
module.exports.helperPath = helperPath;
