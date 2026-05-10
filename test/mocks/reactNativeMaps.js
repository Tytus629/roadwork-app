const React = require('react');

function MockView(props) {
  return React.createElement('View', props, props.children);
}

const MapView = MockView;

module.exports = {
  __esModule: true,
  default: MapView,
  Marker: MockView,
  Polygon: MockView,
  Polyline: MockView,
  PROVIDER_GOOGLE: 'google',
};
