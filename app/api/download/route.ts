import { type NextRequest, NextResponse } from "next/server";

const ALLOWED_HOST = "res.cloudinary.com";

function parseCloudinaryUrl(url: string) {
  // https://res.cloudinary.com/{cloud}/{resource_type}/upload/v{version}/{public_id.ext}
  const match = url.match(/res\.cloudinary\.com\/([^/]+)\/([^/]+)\/upload\/(?:v\d+\/)?(.+)/);
  if (!match) return null;
  const cloud = match[1];
  const resourceType = match[2]; // "image" or "raw"
  const fullId = match[3]; // e.g. "abc123.pdf" or "abc123" (for image)

  // image resources: public_id has no extension — strip it and pass as format param
  // raw resources: public_id includes the extension
  if (resourceType === "image") {
    const dot = fullId.lastIndexOf(".");
    const publicId = dot !== -1 ? fullId.slice(0, dot) : fullId;
    const format = dot !== -1 ? fullId.slice(dot + 1) : undefined;
    return { cloud, resourceType, publicId, format };
  }

  return { cloud, resourceType, publicId: fullId, format: undefined };
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const name = req.nextUrl.searchParams.get("name"); // display filename from DB

  if (!url) return new NextResponse("Missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (parsed.hostname !== ALLOWED_HOST)
    return new NextResponse("URL not allowed", { status: 403 });

  const parts = parseCloudinaryUrl(url);
  if (!parts) return new NextResponse("Invalid Cloudinary URL", { status: 400 });

  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiKey || !apiSecret) return new NextResponse("Server misconfigured", { status: 500 });

  const params = new URLSearchParams({
    public_id: parts.publicId,
    type: "upload",
    attachment: "true",
  });
  if (parts.format) params.set("format", parts.format);

  const adminUrl = `https://api.cloudinary.com/v1_1/${parts.cloud}/${parts.resourceType}/download?${params}`;

  const upstream = await fetch(adminUrl, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
    },
  });

  if (!upstream.ok) {
    return new NextResponse(`Upstream error ${upstream.status}`, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const fileName = name ?? parts.publicId.split("/").pop() ?? "download";

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
