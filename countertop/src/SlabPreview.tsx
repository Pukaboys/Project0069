import { useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { slabFaces, slabVertices } from './model';

const INITIAL_ANGLE = -.6;

export default function SlabPreview({ dimensions }: { dimensions: number[] }) {
  const [angle, setAngle] = useState(INITIAL_ANGLE);
  // A ref, not state: the first move event can arrive before a state update re-renders.
  const gesture = useRef({ x: 0, angle: INITIAL_ANGLE });
  const [width, depth, thickness] = dimensions;
  // Fit the largest footprint diagonal plus thickness so no rotation leaves the viewport.
  const extent = Math.max(Math.hypot(width, depth) / 100 + thickness / 100, .1);
  const scale = 260 / extent;
  const points = slabVertices(dimensions).map(([x, y, z]) => {
    const rx = x * Math.cos(angle) + z * Math.sin(angle);
    const rz = -x * Math.sin(angle) + z * Math.cos(angle);
    return { x: 160 + rx * scale, y: 115 + (rz * .5 - y * .86 + thickness / 200 * .86) * scale, z: rz * .86 + y * .5 };
  });
  const faces = slabFaces.map((indices, index) => ({ indices, index, z: indices.reduce((sum, i) => sum + points[i].z, 0) / 4 })).sort((a, b) => a.z - b.z);
  return <View accessibilityLabel="Rectangular model preview. Drag horizontally to rotate."
    onStartShouldSetResponder={() => true}
    onMoveShouldSetResponder={() => true}
    onResponderTerminationRequest={() => false}
    onResponderGrant={event => { gesture.current = { x: event.nativeEvent.pageX, angle }; }}
    onResponderMove={event => setAngle(gesture.current.angle + (event.nativeEvent.pageX - gesture.current.x) / 100)}>
    <Svg width="100%" height={230} viewBox="0 0 320 230">
      {faces.map(face => <Polygon key={face.index} points={face.indices.map(i => `${points[i].x},${points[i].y}`).join(' ')} fill={face.index === 1 ? '#a2e5c8' : '#426f69'} stroke="#c8f4e3" strokeWidth={1} />)}
    </Svg>
  </View>;
}
