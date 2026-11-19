import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🏗️</Text>
      <Text style={styles.nome}>BELMONTE MOBI</Text>
      <Text style={styles.slogan}>Conectando Você ao Melhor de Belmonte</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2c3e50',
  },
  logo: { fontSize: 80, marginBottom: 20 },
  nome: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    color: '#fff',
    letterSpacing: 3
  },
  slogan: { 
    fontSize: 16, 
    color: '#bdc3c7',
    marginTop: 10
  }
});
