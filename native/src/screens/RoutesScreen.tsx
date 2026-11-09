import { StyleSheet } from "react-native";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Page } from "../components/Overlays";
import { RouteSettings } from "../components/RouteSettings";
import { Button, Title, Txt } from "../components/ui";
import { useSession } from "../session";

export function RoutesScreen() {
  const session = useSession();
  const control = session.client?.routes;
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
      <Title>Routes</Title>
      {control ? (
        <RouteSettings control={control} />
      ) : (
        <Txt size={14} tone="textSecondary">
          Routes are available when you’re connected to Home Assistant.
        </Txt>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: "flex-start", marginBottom: -8 },
});
