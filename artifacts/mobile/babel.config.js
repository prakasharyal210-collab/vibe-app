// Babel presets execute in REVERSE array order.
// So: babel-preset-expo runs FIRST (strips TS/Flow, transforms JSX, etc.)
// Then classTransformPreset runs SECOND on clean JS.
// react-native-reanimated/plugin must run LAST — it is the final plugin
// inside classTransformPreset so it executes after all other transforms.
const classTransformPreset = function () {
  return {
    plugins: [
      // Class field transforms MUST run before class-declaration transform.
      // All class plugins share loose:true for consistency.
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-private-property-in-object', { loose: true }],
      // Convert class declarations → ES5 prototype-chain functions.
      // hermesc linux64-bin (bundled with RN 0.81.x, HBC v96) cannot parse
      // class declarations so we must pre-transform them.
      ['@babel/plugin-transform-classes', { loose: true }],
      // hermesc linux64-bin also cannot compile async ARROW functions
      // (async () => {}) even though async regular functions work fine.
      // Converting all arrows → regular functions fixes this.
      // Must run AFTER class transforms so arrow functions inside class
      // methods are correctly captured.
      ['@babel/plugin-transform-arrow-functions'],
      // Reanimated plugin MUST run last — after all other transforms.
      // It serializes worklet functions (useAnimatedStyle, Gesture callbacks,
      // etc.) into the worklet runtime. Running it last ensures arrow→function
      // transforms don't break the serialized worklet references.
      'react-native-reanimated/plugin',
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
      // Pass reanimated:false so babel-preset-expo does NOT auto-include
      // the Reanimated plugin — we add it explicitly above as the last step.
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
