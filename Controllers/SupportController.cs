using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TeacherReporter.Data;
using TeacherReporter.Models;

namespace TeacherReporter.Controllers
{
    public class SupportController : Controller
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly IWebHostEnvironment _env;

        public SupportController(ApplicationDbContext db,
            UserManager<ApplicationUser> userManager,
            IWebHostEnvironment env)
        {
            _db = db;
            _userManager = userManager;
            _env = env;
        }

        // GET: /Support/Chat
        public async Task<IActionResult> Chat(string? email)
        {
            if (string.IsNullOrEmpty(email))
                return View("ChatStart");

            var messages = await _db.SupportMessages
                .Where(m => m.ThreadId == email)
                .OrderBy(m => m.SentAt)
                .ToListAsync();

        // Mark admin replies as read
            var unread = messages.Where(m => m.IsAdminReply && !m.IsRead).ToList();
            unread.ForEach(m => m.IsRead = true);
            if (unread.Any()) await _db.SaveChangesAsync();

            ViewBag.Email = email;
            ViewBag.ThreadId = email;
            return View("Chat", messages);
        }

        // GET: /Support/Poll — returns new messages as JSON (for real-time polling)
        [HttpGet]
        public async Task<IActionResult> Poll(string threadId, int afterId)
        {
            var messages = await _db.SupportMessages
                .Where(m => m.ThreadId == threadId && m.Id > afterId)
                .OrderBy(m => m.SentAt)
                .ToListAsync();

            var unread = messages.Where(m => m.IsAdminReply && !m.IsRead).ToList();
            unread.ForEach(m => m.IsRead = true);
            if (unread.Any()) await _db.SaveChangesAsync();

            var result = messages.Select(m => new
            {
                id = m.Id,
                message = m.Message,
                isAdminReply = m.IsAdminReply,
                fileName = m.FileName,
                fileMimeType = m.FileMimeType,
                fileStoredName = m.FileStoredName,
                sentAt = TimeZoneInfo.ConvertTimeFromUtc(
                    DateTime.SpecifyKind(m.SentAt, DateTimeKind.Utc),
                    GetKrasZone()).ToString("dd MMM, HH:mm")
            });

            return Json(result);
        }

        private TimeZoneInfo GetKrasZone()
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById("Russia TZ 6 Standard Time"); }
            catch { try { return TimeZoneInfo.FindSystemTimeZoneById("Asia/Krasnoyarsk"); }
                catch { return TimeZoneInfo.CreateCustomTimeZone("Krasnoyarsk",
                    TimeSpan.FromHours(7), "Krasnoyarsk Time", "Krasnoyarsk Standard Time"); } }
        }

        // POST: /Support/SendMessage
        [HttpPost]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> SendMessage(
            string email, string? message, string threadId,
            IFormFile? attachment)
        {
            if (string.IsNullOrWhiteSpace(email))
                return BadRequest("Адрес электронной почты обязателен.");

            if (string.IsNullOrWhiteSpace(message) && attachment == null)
                return BadRequest("Требуется сообщение или вложение.");

            string? fileName = null;
            string? fileStoredName = null;
            string? fileMimeType = null;
            long? fileSize = null;

            if (attachment != null && attachment.Length > 0)
            {
                // Validate file size (max 5MB)
                if (attachment.Length > 5 * 1024 * 1024)
                    return BadRequest("Размер файла не должен превышать 5 МБ.");

                // Validate file type
                var allowedTypes = new[]
                {
                    "image/jpeg", "image/png", "image/gif", "image/webp",
                    "application/pdf",
                    "application/msword",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "application/vnd.ms-excel",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "text/plain"
                };

                if (!allowedTypes.Contains(attachment.ContentType))
                    return BadRequest("Тип файла не допускается.");

                fileName = Path.GetFileName(attachment.FileName);
                fileStoredName = Guid.NewGuid().ToString() +
                    Path.GetExtension(attachment.FileName);
                fileMimeType = attachment.ContentType;
                fileSize = attachment.Length;

                var uploadPath = Path.Combine(
                    _env.WebRootPath, "uploads", "support");
                Directory.CreateDirectory(uploadPath);

                var filePath = Path.Combine(uploadPath, fileStoredName);
                using var stream = new FileStream(filePath, FileMode.Create);
                await attachment.CopyToAsync(stream);
            }

            var msg = new SupportMessage
            {
                SenderEmail = email,
                Message = message?.Trim(),
                IsAdminReply = true,
                SentAt = DateTime.UtcNow,
                ThreadId = threadId,
                IsRead = false,
                FileName = fileName,
                FileStoredName = fileStoredName,
                FileMimeType = fileMimeType,
                FileSize = fileSize
            };

            _db.SupportMessages.Add(msg);
            await _db.SaveChangesAsync();

            return Json(new
            {
                id = msg.Id,
                message = msg.Message,
                isAdminReply = msg.IsAdminReply,
                fileName = msg.FileName,
                fileMimeType = msg.FileMimeType,
                fileStoredName = msg.FileStoredName,
                sentAt = TimeZoneInfo.ConvertTimeFromUtc(
                    DateTime.SpecifyKind(msg.SentAt, DateTimeKind.Utc),
                    GetKrasZone()).ToString("dd MMM, HH:mm")
            });
        }

        // GET: /Support/Download
        public IActionResult Download(string file, string name)
        {
            var path = Path.Combine(
                _env.WebRootPath, "uploads", "support", file);
            if (!System.IO.File.Exists(path))
                return NotFound();

            var contentType = "application/octet-stream";
            return PhysicalFile(path, contentType, name);
        }
    }
}