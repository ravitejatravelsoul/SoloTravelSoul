import { createElement, useId, useSyncExternalStore, type ComponentType } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';
// A namespace import (`import * as`) is a copy of the module; the getters below must replace the real exports.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactNative: Record<string, unknown> = require('react-native');

/** Emitted by the generated MainActivity (plugins/withFontScaleLayoutUpdates.js) once the surface has been laid out with a new font scale. */
export const FONT_SCALE_CHANGED_EVENT = 'fontScaleChanged';

type IdProps = { nativeID?: string; id?: string; testID?: string };

let epoch = 0;
const subscribers = new Set<() => void>();
const subscribe = (notify: () => void) => {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
};
const getEpoch = () => epoch;

/**
 * After a system text-size change React Native re-measures the native shadow tree, but the next React commit
 * installs React's own node instances for every subtree it did not touch. Those were never re-measured, so their
 * views snap back to the old size while the glyphs stay new. Giving each Text/TextInput a prop that changes with
 * the font-scale epoch makes React re-commit them, now measured with the live scale.
 *
 * The prop is an identifier, so it is unique per element (`fsr-<epoch>-<useId>`): no two elements share it, it differs
 * from every earlier epoch, and a caller's own `nativeID`/`id`/`testID` is never replaced. The wrapper renders the same
 * component type without a key, so React updates the element in place: refs, focus, selection and draft text of a
 * TextInput are untouched.
 */
function withFontScaleEpoch<P extends IdProps>(Original: ComponentType<P>): ComponentType<P> {
  function FontScaleAware(props: P) {
    const instance = useId();
    const current = useSyncExternalStore(subscribe, getEpoch, getEpoch);
    let next = props;
    if (current !== 0) {
      const token = `fsr-${current}-${instance}`;
      if (props.nativeID == null && props.id == null) next = { ...props, nativeID: token };
      else if (props.testID == null) next = { ...props, testID: token };
    }
    return createElement(Original as ComponentType<IdProps>, next);
  }
  FontScaleAware.displayName = (Original as { displayName?: string }).displayName ?? Original.name;
  Object.assign(FontScaleAware, Original);
  return FontScaleAware as ComponentType<P>;
}

let installed = false;

/** Android only; call once before the first render (app/_layout.tsx). */
export function installFontScaleRelayout() {
  if (installed || Platform.OS !== 'android') return;
  installed = true;
  for (const name of ['Text', 'TextInput']) {
    const Original = ReactNative[name] as ComponentType<IdProps> | undefined;
    if (typeof Original !== 'function') continue;
    const Wrapped = withFontScaleEpoch(Original);
    Object.defineProperty(ReactNative, name, { configurable: true, enumerable: true, get: () => Wrapped });
  }
  DeviceEventEmitter.addListener(FONT_SCALE_CHANGED_EVENT, () => {
    epoch += 1;
    subscribers.forEach((notify) => notify());
  });
}
