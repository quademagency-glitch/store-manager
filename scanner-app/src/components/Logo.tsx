import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle, Line } from 'react-native-svg';

export default function Logo({ size = 120 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Defs>
        <LinearGradient id="sb-logo-bg" x1="60" y1="40" x2="470" y2="480" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#241E5E" />
          <Stop offset="0.52" stopColor="#171244" />
          <Stop offset="1" stopColor="#0D0A28" />
        </LinearGradient>
        <LinearGradient id="sb-logo-grad" x1="120" y1="120" x2="392" y2="392" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#6366F1" />
          <Stop offset="0.5" stopColor="#4F7BF6" />
          <Stop offset="1" stopColor="#22D3EE" />
        </LinearGradient>
        <LinearGradient id="sb-logo-b1" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#4338CA" />
          <Stop offset="1" stopColor="#4F46E5" />
        </LinearGradient>
        <LinearGradient id="sb-logo-b2" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#5560F0" />
          <Stop offset="1" stopColor="#6366F1" />
        </LinearGradient>
        <LinearGradient id="sb-logo-b3" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#22D3EE" />
          <Stop offset="1" stopColor="#3FE3F2" />
        </LinearGradient>
      </Defs>
      <Rect width="512" height="512" rx="118" fill="url(#sb-logo-bg)" />
      <Circle cx="256" cy="248" r="150" fill="none" stroke="url(#sb-logo-grad)" strokeWidth="30" />
      <Line x1="332" y1="324" x2="392" y2="384" stroke="#0D0A28" strokeWidth="70" strokeLinecap="round" />
      <Line x1="332" y1="324" x2="390" y2="382" stroke="#34E0F0" strokeWidth="42" strokeLinecap="round" />
      <Rect x="186" y="326" width="150" height="20" rx="10" fill="url(#sb-logo-grad)" />
      <Rect x="198" y="274" width="30" height="52" rx="11" fill="url(#sb-logo-b1)" />
      <Rect x="246" y="240" width="30" height="86" rx="11" fill="url(#sb-logo-b2)" />
      <Rect x="294" y="206" width="30" height="120" rx="11" fill="url(#sb-logo-b3)" />
    </Svg>
  );
}
