const React = require('react');

function MockView(props) {
  return React.createElement('View', props, props.children);
}

const exportsObj = {
  GestureHandlerRootView: MockView,
  Swipeable: MockView,
  DrawerLayout: MockView,
  State: {},
  Directions: {},
  PanGestureHandler: MockView,
  TapGestureHandler: MockView,
  LongPressGestureHandler: MockView,
  FlingGestureHandler: MockView,
  ForceTouchGestureHandler: MockView,
  NativeViewGestureHandler: MockView,
  RotationGestureHandler: MockView,
  PinchGestureHandler: MockView,
};

module.exports = exportsObj;
module.exports.default = exportsObj;
