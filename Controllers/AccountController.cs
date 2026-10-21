using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TeacherReporter.Data;
using TeacherReporter.Models;
using TeacherReporter.ViewModels;

namespace TeacherReporter.Controllers
{
    public class AccountController : Controller
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly SignInManager<ApplicationUser> _signInManager;
        private readonly ApplicationDbContext _db;

        public AccountController(UserManager<ApplicationUser> userManager,
            SignInManager<ApplicationUser> signInManager,
            ApplicationDbContext db)
        {
            _userManager = userManager;
            _signInManager = signInManager;
            _db = db;
        }

        // GET: /Account/Login
        public IActionResult Login()
        {
            if (User.Identity?.IsAuthenticated == true)
                return RedirectToAction("Index", "Spreadsheet");
            return View();
        }

        // POST: /Account/Login
        [HttpPost]
        public async Task<IActionResult> Login(LoginViewModel model)
        {
            if (!ModelState.IsValid) return View(model);

            var user = await _userManager.FindByEmailAsync(model.Email);
            if (user != null && user.IsActive)
            {
                ModelState.AddModelError("",
                    "Ваш аккаунт деактивирован. Свяжитесь с администратором.");
                return View(model);
            }

            var result = await _signInManager.PasswordSignInAsync(
                model.Email,
                model.Password,
                isPersistent: model.RememberMe,
                lockoutOnFailure: false);

            if (result.Succeeded)
            {
                // Record last login timestamp
                var loggedInUser = await _userManager.FindByEmailAsync(model.Email);
                if (loggedInUser != null)
                {
                    loggedInUser.LastLoginAt = DateTime.UtcNow;
                    await _userManager.UpdateAsync(loggedInUser);
                }
                return RedirectToAction("Index", "Spreadsheet");
            }

            ModelState.AddModelError("", "Неверный адрес электронной почты или пароль.");
            return View(model);
        }

        // GET: /Account/Register
        public IActionResult Register()
        {
            if (User.Identity?.IsAuthenticated == true)
                return RedirectToAction("Index", "Spreadsheet");
            return View();
        }

        // POST: /Account/Register
        [HttpPost]
        public async Task<IActionResult> Register(RegisterViewModel model)
        {
            if (!ModelState.IsValid) return View(model);

            // Check if email is banned
            var emailBanned = await _db.BannedUsers
                .AnyAsync(b => b.Email == model.Email);
            if (emailBanned)
            {
                ModelState.AddModelError("",
                    "Регистрация с этого адреса электронной почты невозможна.");
                return View(model);
            }

            // Check if IP is banned
            var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
            if (!string.IsNullOrEmpty(ipAddress))
            {
                var ipBanned = await _db.BannedUsers
                    .AnyAsync(b => b.IpAddress == ipAddress);
                if (ipBanned)
                {
                    ModelState.AddModelError("",
                        "Регистрация с данного устройства невозможна.");
                    return View(model);
                }
            }

            var user = new ApplicationUser
            {
                UserName = model.Email,
                Email = model.Email,
                FullName = model.FullName,
                IsActive = true,
                EmailConfirmed = true
            };

            var result = await _userManager.CreateAsync(user, model.Password);

            if (result.Succeeded)
            {
                await _userManager.AddToRoleAsync(user, "Teachers");
                await _signInManager.SignInAsync(user, isPersistent: false);
                return RedirectToAction("Index", "Spreadsheet");
            }

            foreach (var error in result.Errors)
                ModelState.AddModelError("", error.Description);

            return View(model);
        }
        
        // POST: /Account/KeepAlive
        [HttpPost]
        [Authorize]
        [IgnoreAntiforgeryToken]
        public IActionResult KeepAlive()
        {
            return Ok(new { refreshed = true,
                time = DateTime.UtcNow.ToString("HH:mm:ss") });
        }

        // POST: /Account/Logout
        [HttpPost]
        public async Task<IActionResult> Logout()
        {
            await _signInManager.SignOutAsync();
            return RedirectToAction("Login");
        }

        public IActionResult AccessDenied() => View();
    }
}