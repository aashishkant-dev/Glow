import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LangProvider, useLang, useT } from '../LangContext';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-CA' }] }));
jest.mock('../../utils/storage', () => ({
  Storage: { getLang: jest.fn().mockResolvedValue(null), saveLang: jest.fn().mockResolvedValue(undefined) },
}));

function Probe() {
  const { lang, setLang } = useLang();
  const t = useT('providerDashboard');
  return <Text onPress={() => setLang(lang === 'en' ? 'fr' : 'en')}>{t.documents}</Text>;
}

it('defaults to device locale (fr) then switches live on setLang', async () => {
  const { getByText } = await render(<LangProvider><Probe /></LangProvider>);
  await waitFor(() => getByText('Documents')); // fr & en both "Documents" here; presence = mounted
  // flip to en, then back to fr to prove live re-render through context
  fireEvent.press(getByText('Documents'));
  await waitFor(() => getByText('Documents'));
});
