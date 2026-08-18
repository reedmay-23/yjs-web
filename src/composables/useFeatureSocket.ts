import { onBeforeUnmount, ref } from "vue";
import {
  createFeatureSocket,
  type CollabFeature,
  type FeatureEvent,
  type FeatureSocketStatus,
} from "@/services/collabFeatures";
import type { ResourceId } from "@/types/collab-features";

export const useFeatureSocket = () => {
  const status = ref<FeatureSocketStatus>("disconnected");
  const canWrite = ref(true);
  let connection: ReturnType<typeof createFeatureSocket> | null = null;

  const connect = (
    feature: CollabFeature,
    roomId: ResourceId,
    onEvent: (event: FeatureEvent) => void,
    onReconnect?: () => void,
  ) => {
    connection?.close();
    let readyOnce = false;
    connection = createFeatureSocket({
      feature,
      roomId,
      onEvent,
      onStatus: (value) => { status.value = value; },
      onReady: (writable) => {
        canWrite.value = writable;
        if (readyOnce) onReconnect?.();
        readyOnce = true;
      },
    });
  };

  const send = (event: FeatureEvent) => connection?.send(event) ?? false;

  onBeforeUnmount(() => connection?.close());

  return { status, canWrite, connect, send };
};
