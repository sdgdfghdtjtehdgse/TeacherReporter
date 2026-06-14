using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TeacherReporter.Data;
using TeacherReporter.Models;
using TeacherReporter.ViewModels;

namespace TeacherReporter.Controllers
{
    [Authorize]
    public class ProfileController : Controller
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly SignInManager<ApplicationUser> _signInManager;
        private readonly ApplicationDbContext _db;

        public ProfileController(
            UserManager<ApplicationUser> userManager,
            SignInManager<ApplicationUser> signInManager,
            ApplicationDbContext db)
        {
            _userManager = userManager;
            _signInManager = signInManager;
            _db = db;
        }

        // GET: /Profile
        public async Task<IActionResult> Index()
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null) return RedirectToAction("Login", "Account");

            var roles = await _userManager.GetRolesAsync(user);
            var sheetCount = await _db.Spreadsheets
                .CountAsync(s => s.UserId == user.Id);

            var model = new ProfileViewModel
            {
                FullName     = user.FullName,
                Email        = user.Email ?? "",
                CreatedAt    = user.CreatedAt,
                LastLoginAt  = user.LastLoginAt,
                SheetCount   = sheetCount,
                CurrentRole  = roles.FirstOrDefault() ?? "Teacher"
            };

            return View(model);
        }

        // POST: /Profile/UpdateInfo
        [HttpPost]
        public async Task<IActionResult> UpdateInfo(ProfileViewModel model)
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null) return RedirectToAction("Login", "Account");

            var roles = await _userManager.GetRolesAsync(user);
            var sheetCount = await _db.Spreadsheets
                .CountAsync(s => s.UserId == user.Id);
            model.CreatedAt = user.CreatedAt;
            model.SheetCount = sheetCount;
            model.CurrentRole = roles.FirstOrDefault() ?? "Teacher";

            if (!ModelState.IsValid) return View("Index", model);

            // Check if email is taken by another user
            if (user.Email != model.Email)
            {
                var existing = await _userManager
                    .FindByEmailAsync(model.Email);
                if (existing != null && existing.Id != user.Id)
                {
                    ModelState.AddModelError("Email",
                        "Этот адрес электронной почты уже используется.");
                    return View("Index", model);
                }

                // Check if new email is banned
                var banned = await _db.BannedUsers
                    .AnyAsync(b => b.Email == model.Email);
                if (banned)
                {
                    ModelState.AddModelError("Email",
                        "Использование этого адреса электронной почты запрещено.");
                    return View("Index", model);
                }

                user.Email = model.Email;
                user.UserName = model.Email;
                user.NormalizedEmail = model.Email.ToUpper();
                user.NormalizedUserName = model.Email.ToUpper();
            }

            user.FullName = model.FullName;
            var result = await _userManager.UpdateAsync(user);

            if (result.Succeeded)
            {
                await _signInManager.RefreshSignInAsync(user);
                TempData["Success"] = "Профиль успешно обновлен.";
                return RedirectToAction("Index");
            }

            foreach (var error in result.Errors)
                ModelState.AddModelError("", error.Description);

            return View("Index", model);
        }

        // POST: /Profile/ChangePassword
        [HttpPost]
        public async Task<IActionResult> ChangePassword(
            ChangePasswordViewModel model)
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null) return RedirectToAction("Login", "Account");

            if (!ModelState.IsValid)
            {
                TempData["PasswordError"] = "Пожалуйста, исправьте ошибки, указанные ниже.";
                return RedirectToAction("Index");
            }

            var result = await _userManager.ChangePasswordAsync(
                user, model.CurrentPassword, model.NewPassword);

            if (result.Succeeded)
            {
                await _signInManager.RefreshSignInAsync(user);
                TempData["PasswordSuccess"] = "Пароль успешно сменён.";
                return RedirectToAction("Index");
            }

            foreach (var error in result.Errors)
                TempData["PasswordError"] = error.Description;

            return RedirectToAction("Index");
        }

        // POST: /Profile/DeleteAccount
        [HttpPost]
        public async Task<IActionResult> DeleteAccount(string password)
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null) return RedirectToAction("Login", "Account");

            // Verify password before deletion
            var valid = await _userManager
                .CheckPasswordAsync(user, password);
            if (!valid)
            {
                TempData["DeleteError"] =
                    "Неверный пароль. Учетная запись не удалена.";
                return RedirectToAction("Index");
            }

            // Delete all sheets
            var sheets = _db.Spreadsheets
                .Where(s => s.UserId == user.Id);
            _db.Spreadsheets.RemoveRange(sheets);
            await _db.SaveChangesAsync();

            await _signInManager.SignOutAsync();
            await _userManager.DeleteAsync(user);

            return RedirectToAction("Login", "Account");
        }
    }
}