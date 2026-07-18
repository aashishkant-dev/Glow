import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { OTPScreen } from '../screens/auth/OTPScreen';
import { PhoneScreen } from '../screens/auth/PhoneScreen';

export type AuthStackParams = {
  Phone: undefined;
  OTP: { phone: string; isNewUser: boolean; role: string };
};

const Stack = createNativeStackNavigator<AuthStackParams>();

export function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Phone" component={PhoneScreen} />
      <Stack.Screen name="OTP" component={OTPScreen} />
    </Stack.Navigator>
  );
}
