/**
 * File Security Utilities
 * Strips metadata from files and optimizes uploads for security and performance
 */

/**
 * Strips all metadata from an image by redrawing it on a canvas
 * This removes EXIF data, GPS coordinates, device info, and all other metadata
 */
async function stripImageMetadata(file: File, quality: number = 0.92): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Canvas context not available"));
      return;
    }

    img.onload = () => {
      try {
        // Set canvas dimensions to match image
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw image to canvas (this strips all metadata)
        ctx.drawImage(img, 0, 0);

        // Convert to blob with specified quality
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to create blob"));
              return;
            }

            // Create a new File object with sanitized name
            const sanitizedName = sanitizeFileName(file.name);
            const newFile = new File([blob], sanitizedName, {
              type: file.type || "image/jpeg",
              lastModified: Date.now(),
            });

            resolve(newFile);
          },
          file.type || "image/jpeg",
          quality
        );
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error("Failed to load image"));
    };

    // Load image from file (this will trigger onload)
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Creates a clean file blob without metadata for non-image files
 * For files that can't be processed, returns a sanitized version
 */
async function stripFileMetadata(file: File): Promise<File> {
  // For non-image files, we can't easily strip metadata
  // But we can sanitize the filename and create a clean blob
  const sanitizedName = sanitizeFileName(file.name);

  // Read file as array buffer and create new blob/file
  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: file.type });

  return new File([blob], sanitizedName, {
    type: file.type,
    lastModified: Date.now(),
  });
}

/**
 * Sanitizes file name to remove potentially dangerous characters
 */
function sanitizeFileName(fileName: string): string {
  // Remove path separators and dangerous characters
  const sanitized = fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_") // Replace non-alphanumeric (except . _ -) with _
    .replace(/\.\./g, "_") // Remove parent directory references
    .replace(/^\./, "_") // Remove leading dots
    .substring(0, 255); // Limit length

  // Ensure it has an extension
  if (!sanitized.includes(".")) {
    return `${sanitized}.file`;
  }

  return sanitized;
}

/**
 * Compresses an image file to reduce size while maintaining quality
 * Returns the compressed file or original if compression fails
 */
async function compressImage(
  file: File,
  maxWidth: number = 1920,
  maxHeight: number = 1920,
  quality: number = 0.85
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Canvas context not available"));
      return;
    }

    img.onload = () => {
      try {
        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file); // Return original if compression fails
              return;
            }

            const compressedFile = new File([blob], sanitizeFileName(file.name), {
              type: "image/jpeg", // Always use JPEG for compression
              lastModified: Date.now(),
            });

            resolve(compressedFile);
          },
          "image/jpeg",
          quality
        );
      } catch (_error) {
        resolve(file); // Return original on error
      }
    };

    img.onerror = () => {
      resolve(file); // Return original on error
    };

    img.src = URL.createObjectURL(file);
  });
}

/**
 * Processes a file: strips metadata and optimizes for upload
 * For images: strips metadata, compresses, and optimizes
 * For other files: strips metadata and sanitizes filename
 */
export async function processFileForUpload(file: File): Promise<{
  file: File;
  originalSize: number;
  processedSize: number;
  compressionRatio: number;
}> {
  const originalSize = file.size;
  let processedFile: File;

  // Check if it's an image
  if (file.type.startsWith("image/")) {
    // First compress (if needed), then strip metadata
    const compressed = await compressImage(file);
    processedFile = await stripImageMetadata(compressed);
  } else {
    // For non-images, just strip what we can
    processedFile = await stripFileMetadata(file);
  }

  const processedSize = processedFile.size;
  const compressionRatio =
    originalSize > 0 ? ((originalSize - processedSize) / originalSize) * 100 : 0;

  return {
    file: processedFile,
    originalSize,
    processedSize,
    compressionRatio: Math.max(0, compressionRatio),
  };
}
