using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using TeacherReporter.Data;
using TeacherReporter.Models;

var builder = WebApplication.CreateBuilder(args);

// Add MVC
builder.Services.AddControllersWithViews();
builder.Services.AddScoped<TeacherReporter.Data.SupportService>();

// Add SQLite Database
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlite(connectionString)
);

// Add Identity (login/register/roles)
builder.Services.AddIdentity<ApplicationUser, IdentityRole>(options =>
{
    // Simple password rules for a training project
    options.Password.RequireDigit = false;
    options.Password.RequiredLength = 6;
    options.Password.RequireNonAlphanumeric = false;
    options.Password.RequireUppercase = false;
    options.Password.RequireLowercase = false;
})
.AddEntityFrameworkStores<ApplicationDbContext>()
.AddDefaultTokenProviders();

// Login/logout redirect settings
builder.Services.ConfigureApplicationCookie(options =>
{
    options.LoginPath         = "/Account/Login";
    options.LogoutPath        = "/Account/Logout";
    options.AccessDeniedPath  = "/Account/AccessDenied";
    options.ExpireTimeSpan    = TimeSpan.FromMinutes(60);
    options.SlidingExpiration = true;
    options.Cookie.HttpOnly   = true;
});

var app = builder.Build();

// Seed admin user on startup
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    await SeedData.Initialize(services);
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseAuthorization();
app.UseMiddleware<TeacherReporter.Data.ActiveUserMiddleware>();
app.UseAuthentication();

app.MapControllerRoute(
    name: "areas",
    pattern: "{area:exists}/{controller=Home}/{action=Index}/{id?}");

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Account}/{action=Login}/{id?}");

// Shortcut routes so bare URLs resolve without /Index
app.MapControllerRoute(
    name: "spreadsheet",
    pattern: "Spreadsheet",
    defaults: new { controller = "Spreadsheet", action = "Index" });

app.MapControllerRoute(
    name: "admin",
    pattern: "Admin",
    defaults: new { controller = "Admin", action = "Index" });

app.MapControllerRoute(
    name: "profile",
    pattern: "Profile",
    defaults: new { controller = "Profile", action = "Index" });

app.MapControllerRoute(
    name: "support",
    pattern: "Support",
    defaults: new { controller = "Support", action = "Chat" });

app.Run();