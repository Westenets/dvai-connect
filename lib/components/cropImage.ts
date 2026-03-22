export const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', (error) => reject(error));
        image.setAttribute('crossOrigin', 'anonymous');
        image.src = url;
    });

/**
 * Returns the new bounding area of a cropped, rotated image.
 */
export async function getCroppedImg(
    imageSrc: string,
    pixelCrop: { x: number; y: number; width: number; height: number },
    targetWidth: number,
    targetHeight: number,
): Promise<Blob | null> {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        return null;
    }

    // Set canvas dimensions to the desired output size
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // Draw the cropped image onto the canvas, scaling it to the target dimensions
    ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        targetWidth,
        targetHeight,
    );

    // As a blob
    return new Promise((resolve) => {
        canvas.toBlob(
            (file) => {
                resolve(file);
            },
            'image/jpeg',
            0.9,
        );
    });
}
