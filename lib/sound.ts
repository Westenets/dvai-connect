let isMessageSoundPlaying = false;

export const playSound = (path: string) => {
    try {
        const audio = new Audio(path);
        audio.play().catch((err) => {
            console.error('Failed to play sound:', err);
        });
    } catch (err) {
        console.error('Audio API not supported:', err);
    }
};

export const playMessageSound = () => {
    if (isMessageSoundPlaying) return;

    isMessageSoundPlaying = true;
    playSound(SOUNDS.NEW_MESSAGE);

    // Reset the flag after a short delay (debouncing)
    setTimeout(() => {
        isMessageSoundPlaying = false;
    }, 1000); // 1 second debounce
};

export const SOUNDS = {
    JOIN_REQUEST: '/sounds/join-request.mp3',
    UNMUTE_REQUEST: '/sounds/unmute-request.mp3',
    NEW_MESSAGE: '/sounds/new-message.mp3',
};
