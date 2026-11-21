import { Linking, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Page } from "../components/Overlays";
import { Button, Card, FieldLabel, Title, Txt } from "../components/ui";

const email = "imprint@abstract-labs.org";

export function ImprintScreen() {
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/settings");
  return (
    <Page>
      <Button
        kind="plain"
        icon={ArrowLeft}
        label="Settings"
        onPress={back}
        style={styles.back}
      />
      <Title>Imprint</Title>

      <View style={styles.section}>
        <FieldLabel>Information according to § 5 DDG</FieldLabel>
        <Card style={styles.card}>
          <Txt size={15} weight="semibold">
            Valentin Obermeier
          </Txt>
          <Txt size={14} tone="textSecondary" style={styles.lines}>
            {
              "c/o Block Services\nStuttgarter Str. 106\n70736 Fellbach\nGermany"
            }
          </Txt>
        </Card>
      </View>

      <View style={styles.section}>
        <FieldLabel>Contact</FieldLabel>
        <Button
          kind="text"
          label={email}
          accessibilityHint="Writes an email"
          style={{ alignSelf: "flex-start" }}
          onPress={() => Linking.openURL(`mailto:${email}`)}
        />
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: "flex-start", marginBottom: -8 },
  section: { gap: 10 },
  card: { padding: 16, gap: 6 },
  lines: { lineHeight: 21 },
});
