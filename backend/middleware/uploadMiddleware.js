import multer from "multer";

const storage = multer.memoryStorage();

const MAX_FILE_SIZE_BYTES = parseInt(process.env.MAX_FILE_SIZE_MB || "25", 10) * 1024 * 1024;

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (req, file, cb) => {
    const original = file.originalname.toLowerCase();
    if (/\.(pdf|docx|doc|pptx|ppt)$/i.test(original)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file format. Please upload PDF, DOCX, DOC, PPTX, or PPT."));
    }
  },
});
