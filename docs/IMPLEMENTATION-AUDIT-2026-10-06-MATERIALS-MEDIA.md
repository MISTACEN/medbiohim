# Materials / Media audit — 2026-10-06

## Result

### Fixed in code
- `FileRepository::listForUser()` previously returned only uploader-owned/public files.
- `assertAccess()` already allowed active group members to access group-visible files.
- The two methods therefore had different visibility semantics.
- Fixed in commit `e689197738c3c45c44117f3313836a5b7590ea16`.

### Live Supabase state
At audit time:
- `public.files`: 1 row total.
- Active files: 0.
- Documents/images in `public.files`: 0.
- The only row is a deleted test artifact (`t`) with no MIME, no B2 file id and no matching Storage object.
- Therefore there is currently no active DOCX/photo metadata row to repair in the database.

### Storage/RLS
- `public.files` RLS already permits active group members to read group files.
- Backend upload validates selected group membership before storing metadata.
- Download/presign path checks file access and specialty access.
- B2 upload stores `object_key` + `b2_file_id` and preserves MIME/size metadata.

## Release implication

The reported “DOCX/photos do not display” issue cannot be fully reproduced from the current production DB because there are no active document/image rows in `public.files`. This is now classified as an **E2E media/deployment verification gap**, not as a proven frontend-only rendering bug.

Required final gate:
1. upload a real DOCX and image through `POST /api/v1/files/upload`;
2. verify B2 object exists;
3. verify `public.files` active metadata;
4. request `GET /api/v1/files/{id}`;
5. verify `download.status=ready`;
6. open the presigned URL on Safari/iPhone and desktop browsers;
7. verify Materials lists the file in the selected academic group context.

Do not fabricate production media rows just to make the check green.
