import React from 'react';
import { Redirect } from 'expo-router';
import { AppPage, ScreenLoading } from '@/components/common';
import { useStore } from '@/components/StoreContext';

export default function IndexRoute() {
  const { ready, currentUser } = useStore();
  if (!ready) return <AppPage scroll={false}><ScreenLoading /></AppPage>;
  return <Redirect href={currentUser ? '/(tabs)' : '/login'} />;
}
