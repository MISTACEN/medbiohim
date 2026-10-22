/**
 * University Hub API - fetches public RSS feeds and pages from FESMU (ДВГМУ)
 * Provides news, announcements, and events without requiring authentication.
 * 
 * This is a fallback service - primary data source is official websites.
 */
import { NextRequest, NextResponse } from "next/server";

type FeedData = {
  ok: boolean;
  fetched_at: string;
  portal: {
    name: string;
    url: string;
    eios_url: string;
    testing_url: string;
    library_url: string;
  };
  disclaimer: string;
  schedule: {
    index_url: string;
    faculties: Array<{
      id: string;
      title: string;
      program: string | null;
      code: string | null;
      url: string;
    }>;
    note: string;
  };
  feeds: Record<"news" | "announcements" | "events", {
    source: string;
    label: string;
    items: Array<{
      title: string;
      url: string;
      date: string | null;
      source: string;
    }>;
    error: string | null;
    cached?: boolean;
  }>;
  error?: string;
};

const OFFICIAL_PORTAL = {
  name: "Федеральное государственное бюджетное образовательное учреждение высшего образования « Дальневосточный государственный медицинский университет» Министерства здравоохранения Российской Федерации",
  url: "https://www.fesmu.ru/",
  eios_url: "https://eios.fesmu.ru/WebApp/#/",
  testing_url: "http://test.fesmu.ru:8080/",
  library_url: "https://elib.fesmu.ru/",
};

const SCHEDULE_INDEX_URL = "https://www.fesmu.ru/ucheba/raspisanie/";

const FACULTIES = [
  {
    id: "lechebnyy",
    title: "Лечебное дело",
    program: "Медицинский институт",
    code: "лф",
    url: "https://www.fesmu.ru/ucheba/raspisanie/lf/"
  },
  {
    id: "pediatriya",
    title: "Педиатрия",
    program: "Медицинский институт",
    code: "пф",
    url: "https://www.fesmu.ru/ucheba/raspisanie/pf/"
  },
  {
    id: "farmatsiya",
    title: "Фармация",
    program: "Институт фармации",
    code: "bf",
    url: "https://www.fesmu.ru/ucheba/raspisanie/bf/"
  },
  {
    id: "smt",
    title: "Стоматология",
    program: "Медицинский институт",
    code: "смф",
    url: "https://www.fesmu.ru/ucheba/raspisanie/smf/"
  },
] as const;

async function parseFesmuNewsHtml(url: string): Promise<Array<{ title: string; url: string; date: string | null }>> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    
    // Extract links with news/ press-center paths
    const regex = /href="([^"]*press-center[^"]*|[^"]*news[^"]*)"[^>]*>([^<]+)<\/a>/gi;
    const results: Array<{ title: string; url: string; date: string | null }> = [];
    
    let match;
    while ((match = regex.exec(html)) !== null) {
      const href = match[1];
      const title = match[2].trim();
      if (title && href && href.length > 10) {
        results.push({
          title: decodeURIComponent(title).replace(/&nbsp;/g, " ").replace(/&quot;/g, '"'),
          url: `https:${href.startsWith("//") ? href : `//${new URL(url).host}${href}`}`,
          date: null,
        });
      }
    }
    
    return results.slice(0, 50);
  } catch (error) {
    console.error("[fesmu:parse-news]", error);
    return [];
  }
}

async function parseSchedulePage(url: string): Promise<Array<{ title: string; url: string; course: string | null; semester: string | null; kind: string; context: string | null }>> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    
    // Extract PDF links with education-related text
    const pdfRegex = /href="([^"]*\.(?:pdf|docx?))[">]([^<]+)/gi;
    const results: Array<{ title: string; url: string; course: string | null; semester: string | null; kind: string; context: string | null }> = [];
    
    let match;
    while ((match = pdfRegex.exec(html)) !== null) {
      const href = match[1];
      const text = match[2].trim();
      
      if (text.toLowerCase().includes("расписание") || text.toLowerCase().includes("экзамен") || text.toLowerCase().includes("зачет")) {
        const urlStr = `https:${href.startsWith("//") ? href : `://${new URL(url).host}${href}`}`;
        
        // Extract course number if present
        const courseMatch = text.match(/(\d+)-?\s*(курс|kf)/i);
        const course = courseMatch ? `${courseMatch[1]} курс` : null;
        
        results.push({
          title: decodeURIComponent(text).replace(/&nbsp;/g, " "),
          url: urlStr,
          course,
          semester: text.includes("семестр") ? text.match(/(\d+)/)?.[0] || null : null,
          kind: href.endsWith(".pdf") ? "PDF" : "DOCX",
          context: text.includes("ликвидация") ? "Задолженности" : null,
        });
      }
    }
    
    return results.sort((a, b) => {
      const na = a.course ? parseInt(a.course) : 999;
      const nb = b.course ? parseInt(b.course) : 999;
      return na - nb;
    });
  } catch (error) {
    console.error("[fesmu:parse-schedule]", error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const facultyId = request.nextUrl.searchParams.get("faculty");
  
  // If faculty-specific, return just schedule
  if (facultyId) {
    const faculty = FACULTIES.find(f => f.id === facultyId);
    if (!faculty) {
      return NextResponse.json({
        ok: false,
        error: "Неизвестный факультет",
      }, { status: 404 });
    }
    
    try {
      const items = await parseSchedulePage(faculty.url);
      return NextResponse.json({
        ok: true,
        faculty,
        fetched_at: new Date().toISOString(),
        source: faculty.url,
        items,
      });
    } catch (error) {
      return NextResponse.json({
        ok: false,
        faculty,
        error: error instanceof Error ? error.message : "Не удалось загрузить расписание",
        fetched_at: new Date().toISOString(),
        source: faculty.url,
        items: [],
      });
    }
  }
  
  // Main overview endpoint
  try {
    // Parse all three feed types in parallel
    const [newsItems, announcementItems, eventItems] = await Promise.all([
      parseFesmuNewsHtml("https://www.fesmu.ru/press-center/news/"),
      parseFesmuNewsHtml("https://www.fesmu.ru/press-center/announcement/"),
      parseFesmuNewsHtml("https://www.fesmu.ru/press-center/event/"),
    ]);
    
    return NextResponse.json({
      ok: true,
      fetched_at: new Date().toISOString(),
      portal: OFFICIAL_PORTAL,
      disclaimer: "Мы не храним контент и не подменяем официальные источники. Все данные помечены ссылкой на ФЕСМУ.",
      schedule: {
        index_url: SCHEDULE_INDEX_URL,
        faculties: FACULTIES.map(f => ({
          id: f.id,
          title: f.title,
          program: f.program,
          code: f.code,
          url: f.url,
        })),
        note: "Официальные PDF-файлы. MEDBIOHIM не изменяет документы вуза.",
      },
      feeds: {
        news: {
          source: "https://www.fesmu.ru/press-center/news/",
          label: "Новости",
          items: newsItems,
          error: newsItems.length === 0 ? "Сейчас нет новых новостей" : null,
        },
        announcements: {
          source: "https://www.fesmu.ru/press-center/announcement/",
          label: "Объявления",
          items: announcementItems,
          error: announcementItems.length === 0 ? "Сейчас нет новых объявлений" : null,
        },
        events: {
          source: "https://www.fesmu.ru/press-center/event/",
          label: "Анонсы",
          items: eventItems,
          error: eventItems.length === 0 ? "Сейчас нет анонсированных мероприятий" : null,
        },
      },
    });
  } catch (error) {
    console.error("[university:overview]", error);
    
    // Return partial data with error message instead of failing completely
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Не удалось загрузить данные ФЕСМУ",
      fetched_at: new Date().toISOString(),
      portal: OFFICIAL_PORTAL,
      disclaimer: "Мы не храним контент и не подменяем официальные источники.",
      schedule: {
        index_url: SCHEDULE_INDEX_URL,
        faculties: FACULTIES.map(f => ({
          id: f.id,
          title: f.title,
          program: f.program,
          code: f.code,
          url: f.url,
        })),
        note: "PDF-файлы доступны по ссылкам.",
      },
      feeds: {
        news: {
          source: "https://www.fesmu.ru/press-center/news/",
          label: "Новости",
          items: [],
          error: error instanceof Error ? error.message : "Ошибка загрузки",
        },
        announcements: {
          source: "https://www.fesmu.ru/press-center/announcement/",
          label: "Объявления",
          items: [],
          error: error instanceof Error ? error.message : "Ошибка загрузки",
        },
        events: {
          source: "https://www.fesmu.ru/press-center/event/",
          label: "Анонсы",
          items: [],
          error: error instanceof Error ? error.message : "Ошибка загрузки",
        },
      },
    } as FeedData, { status: 200 }); // Return 200 so UI can still show fallback links
  }
}
