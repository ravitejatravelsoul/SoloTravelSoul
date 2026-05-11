import { Component, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Colors, Spacing } from '@/constants/theme';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  reset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.icon}>⚠️</Text>
        <Text variant="h3" center style={styles.title}>
          {this.props.fallbackTitle ?? 'Something went wrong'}
        </Text>
        <Text variant="caption" center style={styles.detail} numberOfLines={3}>
          {this.state.message}
        </Text>
        <Button label="Try again" onPress={this.reset} style={styles.btn} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing['2xl'],
    backgroundColor: Colors.background,
  },
  icon: { fontSize: 48, marginBottom: Spacing.lg },
  title: { marginBottom: Spacing.sm },
  detail: { color: Colors.textSecondary, marginBottom: Spacing['2xl'] },
  btn: { minWidth: 160 },
});
