// Client-side OCR via Tesseract.js (dynamic import keeps the bundle lean).
// Runs entirely in the browser — screenshots never leave the device.

export async function ocrImage(file: File | Blob): Promise<string> {
  const ocrPromise = (async () => {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng+hin");
    try {
      const { data } = await worker.recognize(file);
      return data.text || "";
    } finally {
      await worker.terminate();
    }
  })();

  const timeoutPromise = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error("OCR timeout (exceeded 25s)")), 25000)
  );

  return Promise.race([ocrPromise, timeoutPromise]);
}

export async function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}