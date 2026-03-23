import {ref} from "vue";
import {float32ToInt16} from "../utils/audio";

/**
 * Manages microphone capture (AudioContext + ScriptProcessor).
 * Caller decides what to do with each PCM frame via the `onAudio` callback.
 */
export function useMicrophone(onAudio: (pcm: ArrayBuffer) => void, sampleRate = 16000) {
    const isRecording = ref(false);

    let audioCtx: AudioContext | null = null;
    let processor: ScriptProcessorNode | null = null;
    let stream: MediaStream | null = null;

    async function start() {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });
        audioCtx = new AudioContext({sampleRate});
        const source = audioCtx.createMediaStreamSource(stream);
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        processor = audioCtx.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        processor.connect(audioCtx.destination);
        processor.onaudioprocess = (e) => {
            onAudio(float32ToInt16(e.inputBuffer.getChannelData(0)));
        };
        isRecording.value = true;
    }

    function stop() {
        processor?.disconnect();
        audioCtx?.close();
        stream?.getTracks().forEach((t) => t.stop());
        audioCtx = processor = stream = null;
        isRecording.value = false;
    }

    return {isRecording, start, stop};
}
