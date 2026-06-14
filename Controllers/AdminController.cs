using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TeacherReporter.Data;
using TeacherReporter.Models;
using TeacherReporter.ViewModels;

namespace TeacherReporter.Controllers
{
    public class AdminController : AdminBaseController
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly ApplicationDbContext _db;
        private readonly IWebHostEnvironment _env;

        public AdminController(UserManager<ApplicationUser> userManager,
            ApplicationDbContext db,
            IWebHostEnvironment env,
            SupportService supportService)
            : base(supportService)
        {
            _userManager = userManager;
            _db = db;
            _env = env;
        }

        // GET: /Admin/Index
        public async Task<IActionResult> Index()
        {
            var users = await _userManager.Users.ToListAsync();
            var model = new List<AdminUserViewModel>();

            foreach (var user in users)
            {
                var roles = await _userManager.GetRolesAsync(user);
                var sheetCount = await _db.Spreadsheets
                    .CountAsync(s => s.UserId == user.Id);

                model.Add(new AdminUserViewModel
                {
                    Id          = user.Id,
                    FullName    = user.FullName,
                    Email       = user.Email ?? "",
                    IsActive    = user.IsActive,
                    CreatedAt   = user.CreatedAt,
                    LastLoginAt = user.LastLoginAt,
                    Roles       = roles.ToList(),
                    SheetCount  = sheetCount
                });
            }

            var stats = new AdminStatsViewModel
            {
                TotalUsers = model.Count,
                TotalTeachers = model.Count(u => u.Roles.Contains("Teacher")),
                TotalSheets = await _db.Spreadsheets.CountAsync(),
                ActiveUsers = model.Count(u => u.IsActive),
                Users = model
            };

            return View(stats);
        }

        // POST: /Admin/ToggleActive
        [HttpPost]
        public async Task<IActionResult> ToggleActive(string userId)
        {
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null) return NotFound();

            var currentUser = await _userManager.GetUserAsync(User);
            if (user.Id == currentUser!.Id)
            {
                TempData["Error"] = "You cannot deactivate your own account.";
                return RedirectToAction("Index");
            }

            user.IsActive = !user.IsActive;
            await _userManager.UpdateAsync(user);
            return RedirectToAction("Index");
        }

        // POST: /Admin/DeleteUser
        [HttpPost]
        public async Task<IActionResult> DeleteUser(string userId)
        {
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null) return NotFound();

            var currentUser = await _userManager.GetUserAsync(User);
            if (user.Id == currentUser!.Id)
            {
                TempData["Error"] = "You cannot delete your own account.";
                return RedirectToAction("Index");
            }

            var sheets = _db.Spreadsheets.Where(s => s.UserId == userId);
            _db.Spreadsheets.RemoveRange(sheets);
            await _db.SaveChangesAsync();

            await _userManager.DeleteAsync(user);
            return RedirectToAction("Index");
        }

        // POST: /Admin/BanUser
        [HttpPost]
        public async Task<IActionResult> BanUser(string userId)
        {
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null) return NotFound();

            var currentUser = await _userManager.GetUserAsync(User);
            if (user.Id == currentUser!.Id)
            {
                TempData["Error"] = "You cannot ban your own account.";
                return RedirectToAction("Index");
            }

            // Check not already banned
            var alreadyBanned = await _db.BannedUsers
                .AnyAsync(b => b.Email == user.Email);
            if (alreadyBanned)
            {
                TempData["Error"] = $"{user.Email} is already banned.";
                return RedirectToAction("Index");
            }

            // Get user's last known IP from claims
            var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();

            // Save ban record
            var ban = new BannedUser
            {
                Email = user.Email,
                IpAddress = ipAddress,
                BannedByAdminId = currentUser.Id,
                BannedAt = DateTime.UtcNow,
                Reason = "Permanently banned by administrator"
            };
            _db.BannedUsers.Add(ban);

            // Delete all their sheets
            var sheets = _db.Spreadsheets.Where(s => s.UserId == userId);
            _db.Spreadsheets.RemoveRange(sheets);
            await _db.SaveChangesAsync();

            // Delete the user account
            await _userManager.DeleteAsync(user);

            TempData["Success"] = $"User {ban.Email} has been permanently banned.";
            return RedirectToAction("Index");
        }

        // GET: /Admin/UserSheets
        public async Task<IActionResult> UserSheets(string userId)
        {
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null) return NotFound();

            var sheets = await _db.Spreadsheets
                .Where(s => s.UserId == userId)
                .OrderByDescending(s => s.UpdatedAt)
                .ToListAsync();

            ViewBag.TargetUser = user;
            return View(sheets);
        }

        // POST: /Admin/DeleteSheet
        [HttpPost]
        public async Task<IActionResult> DeleteSheet(int sheetId, string userId)
        {
            var sheet = await _db.Spreadsheets.FindAsync(sheetId);
            if (sheet != null)
            {
                _db.Spreadsheets.Remove(sheet);
                await _db.SaveChangesAsync();
            }
            return RedirectToAction("UserSheets", new { userId });
        }
        
        // GET: /Admin/BannedUsers
        public async Task<IActionResult> BannedUsers()
        {
            var bans = await _db.BannedUsers
                .OrderByDescending(b => b.BannedAt)
                .ToListAsync();
            return View(bans);
        }

        // POST: /Admin/UnbanUser
        [HttpPost]
        public async Task<IActionResult> UnbanUser(int banId)
        {
            var ban = await _db.BannedUsers.FindAsync(banId);
            if (ban != null)
            {
                _db.BannedUsers.Remove(ban);
                await _db.SaveChangesAsync();
                TempData["Success"] = $"{ban.Email} has been unbanned and can register again.";
            }
            return RedirectToAction("BannedUsers");
        }
        
        // GET: /Admin/Support
        public async Task<IActionResult> Support()
        {
            // Get all unique threads with latest message and unread count
            var threads = await _db.SupportMessages
                .GroupBy(m => m.ThreadId)
                .Select(g => new SupportThreadViewModel
                {
                    ThreadId = g.Key,
                    Email = g.Key,
                    LastMessage = g.OrderByDescending(m => m.SentAt)
                        .Select(m => m.Message).First(),
                    LastMessageAt = g.Max(m => m.SentAt),
                    UnreadCount = g.Count(m => !m.IsAdminReply && !m.IsRead),
                    TotalMessages = g.Count()
                })
                .OrderByDescending(t => t.LastMessageAt)
                .ToListAsync();
        
            return View(threads);
        }
        
        // GET: /Admin/SupportThread
        public async Task<IActionResult> SupportThread(string threadId)
        {
            var messages = await _db.SupportMessages
                .Where(m => m.ThreadId == threadId)
                .OrderBy(m => m.SentAt)
                .ToListAsync();
        
            // Mark user messages as read
            var unread = messages.Where(m => !m.IsAdminReply && !m.IsRead).ToList();
            unread.ForEach(m => m.IsRead = true);
            if (unread.Any()) await _db.SaveChangesAsync();
        
            ViewBag.ThreadId = threadId;
            ViewBag.Email = threadId;
            return View(messages);
        }
        
        // POST: /Admin/ReplyToThread
        [HttpPost]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> ReplyToThread(
            string threadId, string? message, IFormFile? attachment)
        {
            if (string.IsNullOrWhiteSpace(message) && attachment == null)
                return BadRequest("Message or attachment required.");

            var admin = await _userManager.GetUserAsync(User);

            string? fileName = null;
            string? fileStoredName = null;
            string? fileMimeType = null;
            long? fileSize = null;

            if (attachment != null && attachment.Length > 0)
            {
                if (attachment.Length > 5 * 1024 * 1024)
                    return BadRequest("File size must be under 5MB.");

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
                SenderEmail = admin!.Email ?? "admin@school.com",
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

        // GET: /Admin/PollThread — for real-time polling in admin thread view
        [HttpGet]
        public async Task<IActionResult> PollThread(string threadId, int afterId)
        {
            var messages = await _db.SupportMessages
                .Where(m => m.ThreadId == threadId && m.Id > afterId)
                .OrderBy(m => m.SentAt)
                .ToListAsync();

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
        
        // GET: /Admin/UnreadCount
        [HttpGet]
        public async Task<IActionResult> UnreadCount()
        {
            var count = await _db.SupportMessages
                .CountAsync(m => !m.IsAdminReply && !m.IsRead);
            return Json(new { count });
        }
        
        // GET: /Admin/EditUser?userId=...
        public async Task<IActionResult> EditUser(string userId)
        {
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null) return NotFound();
        
            var roles = await _userManager.GetRolesAsync(user);
            var sheetCount = await _db.Spreadsheets
                .CountAsync(s => s.UserId == user.Id);
        
            var model = new EditUserViewModel
            {
                Id          = user.Id,
                FullName    = user.FullName,
                Email       = user.Email ?? "",
                IsActive    = user.IsActive,
                Roles       = roles.ToList(),
                CreatedAt   = user.CreatedAt,
                LastLoginAt = user.LastLoginAt,
                SheetCount  = sheetCount
            };
        
            return View(model);
        }
        
        // POST: /Admin/EditUser
        [HttpPost]
        public async Task<IActionResult> EditUser(EditUserViewModel model)
        {
            var user = await _userManager.FindByIdAsync(model.Id);
            if (user == null) return NotFound();
        
            // Reload roles and sheet count for view if validation fails
            var roles = await _userManager.GetRolesAsync(user);
            var sheetCount = await _db.Spreadsheets
                .CountAsync(s => s.UserId == user.Id);
            model.Roles = roles.ToList();
            model.SheetCount = sheetCount;
            model.CreatedAt = user.CreatedAt;
        
            if (!ModelState.IsValid) return View(model);
        
            // Check email not taken by someone else
            if (user.Email != model.Email)
            {
                var existing = await _userManager.FindByEmailAsync(model.Email);
                if (existing != null && existing.Id != user.Id)
                {
                    ModelState.AddModelError("Email",
                        "This email is already in use by another account.");
                    return View(model);
                }
        
                var banned = await _db.BannedUsers
                    .AnyAsync(b => b.Email == model.Email);
                if (banned)
                {
                    ModelState.AddModelError("Email",
                        "This email address is not permitted.");
                    return View(model);
                }
        
                user.Email = model.Email;
                user.UserName = model.Email;
                user.NormalizedEmail = model.Email.ToUpper();
                user.NormalizedUserName = model.Email.ToUpper();
            }
        
            user.FullName = model.FullName;
            user.IsActive = model.IsActive;
        
            var result = await _userManager.UpdateAsync(user);
        
            if (result.Succeeded)
            {
                TempData["Success"] = $"{model.FullName}'s profile updated successfully.";
                return RedirectToAction("Index");
            }
        
            foreach (var error in result.Errors)
                ModelState.AddModelError("", error.Description);
        
            return View(model);
        }
        
        // GET: /Admin/ResetPassword?userId=...
        public async Task<IActionResult> ResetPassword(string userId)
        {
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null) return NotFound();
        
            var model = new AdminResetPasswordViewModel
            {
                UserId = user.Id,
                FullName = user.FullName
            };
        
            return View(model);
        }
        
        // POST: /Admin/ResetPassword
        [HttpPost]
        public async Task<IActionResult> ResetPassword(
            AdminResetPasswordViewModel model)
        {
            if (!ModelState.IsValid) return View(model);
        
            var user = await _userManager.FindByIdAsync(model.UserId);
            if (user == null) return NotFound();
        
            // Remove old password and set new one
            var token = await _userManager.GeneratePasswordResetTokenAsync(user);
            var result = await _userManager.ResetPasswordAsync(
                user, token, model.NewPassword);
        
            if (result.Succeeded)
            {
                TempData["Success"] =
                    $"Password for {user.FullName} reset successfully.";
                return RedirectToAction("Index");
            }
        
            foreach (var error in result.Errors)
                ModelState.AddModelError("", error.Description);
        
            return View(model);
        }
        
        // POST: /Admin/DeleteThread
        [HttpPost]
        public async Task<IActionResult> DeleteThread(string threadId)
        {
            var msgs = _db.SupportMessages.Where(m => m.ThreadId == threadId);
            _db.SupportMessages.RemoveRange(msgs);
            await _db.SaveChangesAsync();
            TempData["Success"] = "Conversation deleted.";
            return RedirectToAction("Support");
        }
        
        private TimeZoneInfo GetKrasZone()
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById("Russia TZ 6 Standard Time"); }
            catch { try { return TimeZoneInfo.FindSystemTimeZoneById("Asia/Krasnoyarsk"); }
                catch { return TimeZoneInfo.CreateCustomTimeZone("Krasnoyarsk",
                    TimeSpan.FromHours(7), "Krasnoyarsk Time", "Krasnoyarsk Standard Time"); } }
        }
        
        // GET: /Admin/ExportUsers
        public async Task<IActionResult> ExportUsers()
        {
            var users = await _userManager.Users.ToListAsync();
            var rows  = new List<List<string>>();

            // Header row
            rows.Add(new List<string>
            {
                "Full Name", "Email", "Role", "Status",
                "Sheets", "Registered (Krasnoyarsk)"
            });

            var krasZone = GetKrasZone();

            foreach (var user in users.OrderBy(u => u.FullName))
            {
                var roles      = await _userManager.GetRolesAsync(user);
                var sheetCount = await _db.Spreadsheets
                    .CountAsync(s => s.UserId == user.Id);
                var regDate    = TimeZoneInfo.ConvertTimeFromUtc(
                    DateTime.SpecifyKind(user.CreatedAt, DateTimeKind.Utc),
                    krasZone).ToString("dd MMM yyyy, HH:mm");

                rows.Add(new List<string>
                {
                    user.FullName,
                    user.Email ?? "",
                    string.Join(", ", roles),
                    user.IsActive ? "Active" : "Inactive",
                    sheetCount.ToString(),
                    regDate
                });
            }

            // Build CSV content (Excel opens CSV files natively)
            var sb = new System.Text.StringBuilder();
            foreach (var row in rows)
            {
                var escaped = row.Select(cell =>
                    '"' + (cell ?? "").Replace("\"", "\"\"") + '"');
                sb.AppendLine(string.Join(",", escaped));
            }

            var bytes    = System.Text.Encoding.UTF8.GetPreamble()
                .Concat(System.Text.Encoding.UTF8.GetBytes(sb.ToString()))
                .ToArray();
            var fileName = "users_" +
                           DateTime.Now.ToString("yyyy-MM-dd") + ".csv";

            return File(bytes, "text/csv", fileName);
        }
    }
    
}