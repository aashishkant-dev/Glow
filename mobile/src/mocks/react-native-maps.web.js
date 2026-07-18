import React from 'react';
import { View } from 'react-native';

const MapView = (props) => <View {...props} />;
MapView.Animated = (props) => <View {...props} />;
const Marker = (props) => null;
const Polyline = (props) => null;
const Circle = (props) => null;
const Callout = (props) => <View {...props} />;

export default MapView;
export { Marker, Polyline, Circle, Callout };
