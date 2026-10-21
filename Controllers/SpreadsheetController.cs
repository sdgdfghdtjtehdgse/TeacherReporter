using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TeacherReporter.Data;
using TeacherReporter.Models;

namespace TeacherReporter.Controllers
{
    [Authorize]
    public class SpreadsheetController : Controller
    {
        private readonly ApplicationDbContext _db;
        private readonly UserManager<ApplicationUser> _userManager;

        public SpreadsheetController(ApplicationDbContext db,
            UserManager<ApplicationUser> userManager)
        {
            _db = db;
            _userManager = userManager;
        }

        // GET: /Spreadsheet/Index
        public async Task<IActionResult> Index()
        {
            var user = await _userManager.GetUserAsync(User);
            var sheets = await _db.Spreadsheets
                .Where(s => s.UserId == user!.Id)
                .OrderByDescending(s => s.UpdatedAt)
                .ToListAsync();
            return View(sheets);
        }

        // GET: /Spreadsheet/Templates
        public IActionResult Templates()
        {
            return View();
        }

        // GET: /Spreadsheet/Editor/5
        public async Task<IActionResult> Editor(int? id, string? template)
        {
            if (id == null)
            {
                var newSheet = new SpreadsheetModel();
                if (!string.IsNullOrEmpty(template))
                    newSheet.DataJson = GetTemplateData(template);
                return View(newSheet);
            }

            var user = await _userManager.GetUserAsync(User);
            var sheet = await _db.Spreadsheets
                .FirstOrDefaultAsync(s =>
                    s.Id == id && s.UserId == user!.Id);

            if (sheet == null) return NotFound();
            return View(sheet);
        }

        // POST: /Spreadsheet/Save
        [HttpPost]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> Save(
            [FromBody] SaveSheetRequest request)
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null) return Unauthorized();

            if (request.Id == 0)
            {
                var sheet = new SpreadsheetModel
                {
                    Title = request.Title,
                    DataJson = request.DataJson,
                    UserId = user.Id,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                _db.Spreadsheets.Add(sheet);
                await _db.SaveChangesAsync();
                return Ok(new { id = sheet.Id });
            }
            else
            {
                var sheet = await _db.Spreadsheets
                    .FirstOrDefaultAsync(s =>
                        s.Id == request.Id && s.UserId == user.Id);
                if (sheet == null) return NotFound();

                sheet.Title = request.Title;
                sheet.DataJson = request.DataJson;
                sheet.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
                return Ok(new { id = sheet.Id });
            }
        }
        
        // GET: /Spreadsheet/UnreadSupportCount
        [HttpGet]
        public async Task<IActionResult> UnreadSupportCount()
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null) return Json(new { count = 0 });

            var count = await _db.SupportMessages
                .CountAsync(m =>
                    m.ThreadId == user.Email &&
                    m.IsAdminReply &&
                    !m.IsRead);

            return Json(new { count });
        }
        
        // GET: /Spreadsheet/GetData/5
        [HttpGet]
        public async Task<IActionResult> GetData(int id)
        {
            var user = await _userManager.GetUserAsync(User);
            var sheet = await _db.Spreadsheets
                .FirstOrDefaultAsync(s => s.Id == id);

            if (sheet == null) return NotFound();

            return Json(new
            {
                title = sheet.Title,
                dataJson = sheet.DataJson
            });
        }

        // POST: /Spreadsheet/Delete/5
        [HttpPost]
        public async Task<IActionResult> Delete(int id)
        {
            var user = await _userManager.GetUserAsync(User);
            var sheet = await _db.Spreadsheets
                .FirstOrDefaultAsync(s =>
                    s.Id == id && s.UserId == user!.Id);

            if (sheet != null)
            {
                _db.Spreadsheets.Remove(sheet);
                await _db.SaveChangesAsync();
            }
            return RedirectToAction("Index");
        }

        private string GetTemplateData(string template)
        {
            // All templates now use letter column headers (A, B, C...)
            // Teachers type their own headers in the first row
            var rows = new List<object[]>();

            object[] columns;
            int colCount;

            switch (template)
            {
                case "monthly":
                    colCount = 8;
                    columns = GenerateLetterColumns(colCount);
                    // Pre-fill first row with suggested headers
                    rows.Add(new object[]
                    {
                        "Имя студента", "Неделя 1", "Неделя 2",
                        "Неделя 3", "Неделя 4", "Среднее", "Пропущенные часы", ""
                    });
                    for (int i = 0; i < 15; i++)
                        rows.Add(GenerateBlankRow(colCount));
                    break;

                case "semester":
                    colCount = 8;
                    columns = GenerateLetterColumns(colCount);
            rows.Add(new object[]
            {
                "Имя студента", "Математика", "Русский",
                "История", "Литература", "PE", "Итоговая оценка", ""
            });
            for (int i = 0; i < 15; i++)
                rows.Add(GenerateBlankRow(colCount));
            break;

        case "attendance":
            colCount = 8;
            columns = GenerateLetterColumns(colCount);
            rows.Add(new object[]
            {
                "Имя студента", "Неделя 1", "Неделя 2",
                "Неделя 3", "Неделя 4",
                "Итого присутствующих", "Итого отсутствующих", ""
            });
            for (int i = 0; i < 15; i++)
                rows.Add(GenerateBlankRow(colCount));
            break;

        case "behavior":
            colCount = 6;
            columns = GenerateLetterColumns(colCount);
            rows.Add(new object[]
            {
                "Имя студента", "Поведение",
                "Участие", "Домашнее задание", "Примечания", ""
            });
            for (int i = 0; i < 15; i++)
                rows.Add(GenerateBlankRow(colCount));
            break;

        case "exam":
            colCount = 7;
            columns = GenerateLetterColumns(colCount);
            rows.Add(new object[]
            {
                "Имя студента", "Бал", "Максимальный балл",
                "Процент", "Оценка", "Статус", ""
            });
            for (int i = 0; i < 15; i++)
                rows.Add(GenerateBlankRow(colCount));
            break;

        case "yearly":
            colCount = 11;
            columns = GenerateLetterColumns(colCount);
            rows.Add(new object[]
            {
                "Имя студента", "Сен", "Окт", "Ноя",
                "Дек", "Янв", "Фев", "Мар",
                "Апр", "Май", "Среднегодовое значение"
            });
            for (int i = 0; i < 15; i++)
                rows.Add(GenerateBlankRow(colCount));
            break;

        default:
            colCount = 10;
            columns = GenerateLetterColumns(colCount);
            for (int i = 0; i < 20; i++)
                rows.Add(GenerateBlankRow(colCount));
            break;
    }

    var tab = new
    {
        name = "Таблица 1",
        data = rows,
        columns,
        styles = "{}"
    };

    return System.Text.Json.JsonSerializer.Serialize(
        new { tabs = new[] { tab }, activeTab = 0 });
}

private static object[] GenerateLetterColumns(int count)
{
    var cols = new object[count];
    for (int i = 0; i < count; i++)
    {
        cols[i] = new
        {
            title = ColumnIndexToLetter(i),
            width = 120,
            type = "text"
        };
    }
    return cols;
}

private static object[] GenerateBlankRow(int colCount)
{
    var row = new object[colCount];
    for (int i = 0; i < colCount; i++) row[i] = "";
    return row;
}

private static string ColumnIndexToLetter(int index)
{
    var letter = "";
    var n = index;
    while (n >= 0)
    {
        letter = (char)('A' + n % 26) + letter;
        n = n / 26;
    }
    return letter;
}
    }

    public class SaveSheetRequest
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string DataJson { get; set; } = string.Empty;
    }
}