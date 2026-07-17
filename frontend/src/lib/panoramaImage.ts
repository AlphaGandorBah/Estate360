const MIN_PANORAMA_ASPECT_RATIO = 1.9

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    const cleanup = () => URL.revokeObjectURL(objectUrl)

    image.onload = () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight }
      cleanup()
      resolve(dimensions)
    }
    image.onerror = () => {
      cleanup()
      reject(new Error('Could not read image dimensions.'))
    }
    image.src = objectUrl
  })
}

export async function validatePanoramaImage(file: File): Promise<string | null> {
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    return 'Only JPEG and PNG panorama images are accepted.'
  }

  try {
    const { width, height } = await getImageDimensions(file)
    const aspectRatio = width / height

    if (aspectRatio < MIN_PANORAMA_ASPECT_RATIO) {
      return `This is a flat ${width}×${height} photo, not a panorama. Use Panorama mode in your Camera app, save the result, then select that image.`
    }
  } catch {
    return 'Could not read this image. Choose a valid JPEG or PNG panorama.'
  }

  return null
}
