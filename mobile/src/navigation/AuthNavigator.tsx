import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { PhoneScreen } from '../screens/auth/PhoneScreen';
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen';

export type AuthStackParams = {
  Phone: undefined;
  ResetPassword: { token: string };
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
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
  );
}
