export const errorHandler = (err, req, res, next) => {
  console.error("Backend Error:", err.stack || err.message);

  if (err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      const maxMb = process.env.MAX_FILE_SIZE_MB || "25";
      return res.status(400).json({ detail: `File size exceeds the allowed limit of ${maxMb}MB.` });
    }
    return res.status(400).json({ detail: err.message });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || "An unexpected server error occurred.";

  res.status(statusCode).json({
    detail: message,
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
};
