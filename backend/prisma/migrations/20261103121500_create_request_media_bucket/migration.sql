DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    )
    VALUES (
      'request-media',
      'request-media',
      false,
      50000000,
      ARRAY[
        'image/jpeg',
        'image/png',
        'image/heic',
        'image/webp',
        'video/mp4',
        'video/quicktime'
      ]::text[]
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END
$$;
