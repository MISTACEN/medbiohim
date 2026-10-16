eted: true, id }, rid));
  } catch (e: any) {
    const { body, status } = fail("DB_ERROR", e?.message || "Не удалось удалить предмет", 503, rid);
    return c.json(body, status as 503);
  }
});

export default subjects;
