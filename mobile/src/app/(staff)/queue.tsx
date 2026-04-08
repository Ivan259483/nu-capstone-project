import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function StaffQueue() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Staff Queue</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  text: { color: '#f97316', fontSize: 24, fontWeight: 'bold' }
});
