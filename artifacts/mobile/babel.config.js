// Babel presets execute in REVERSE array order.
// So: babel-preset-expo runs FIRST (strips TS/Flow, transforms JSX, etc.)
// Then classTransformPreset runs SECOND on clean JS.
//
// react-native-worklets/plugin MUST run LAST.
// Reanimated 4.x uses react-native-worklets as the worklet engine.
// babel-preset-expo v54 auto-selects react-native-worklets/plugin when
// react-native-worklets is installed. We disable that auto-inclusion with
// reanimated:false and add the plugin explicitly as the final step so it
// runs AFTER the arrow-function transform (which hermesc requires for EAS).
const classTransformPreset = function () {
  return {
    plugins: [
      // Class field transforms MUST run before class-declaration transform.
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-private-property-in-object', { loose: true }],
      // hermesc linux64-bin (RN 0.81.x / HBC v96) cannot parse class
      // declarations, so we pre-transform them.
      ['@babel/plugin-transform-classes', { loose: true }],
      // hermesc also cannot compile async ARROW functions; convert to
      // regular functions BEFORE the worklets plugin serializes them.
      ['@babel/plugin-transform-arrow-functions'],
      // Worklets plugin compiles useAnimatedStyle / Gesture callbacks /
      // withSpring callbacks etc. into worklet closures for the UI thread.
      // MUST be last — after all other transforms.
      'react-native-worklets/plugin',
    ],
  };
};

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // Runs LAST (first in array → last executed due to preset reversal).
      classTransformPreset,
      // Runs FIRST (last in array → first executed).
      // reanimated:false prevents babel-preset-expo from auto-including
      // react-native-worklets/plugin so we don't run it twice.
      [
        'babel-preset-expo',
        {
          unstable_transformImportMeta: true,
          reanimated: false,
        },
      ],
    ],
  };
};
