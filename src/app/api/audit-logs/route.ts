import { NextResponse } from 'next/server';
import { getAuditLogs } from '@/lib/store';
import { verifyAuthHeaderOrCookie } from '@/lib/auth';

export async function GET(request: Request) {
  // Guard: Only authenticated Admin can view audit logs
  if (!verifyAuthHeaderOrCookie(request, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized. Admin credentials required to view audit logs.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50') || 50;
    const action = searchParams.get('action') || undefined;
    const actor = searchParams.get('actor') || undefined;
    const isCsv = searchParams.get('export') === 'csv';

    const logs = await getAuditLogs({ limit, action, actor });

    if (isCsv) {
      // Export audit logs to CSV
      const headers = ['Timestamp', 'Actor', 'Action', 'Details', 'IP Address', 'User Agent'];
      const rows = logs.map((l) => [
        `"${new Date(l.timestamp).toISOString()}"`,
        `"${l.actor}"`,
        `"${l.action}"`,
        `"${l.details.replace(/"/g, '""')}"`,
        `"${l.ipAddress || ''}"`,
        `"${(l.userAgent || '').replace(/"/g, '""')}"`,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="anassa_audit_logs_${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      logs,
      count: logs.length,
    });
  } catch (error) {
    console.error('API /api/audit-logs error:', error);
    return NextResponse.json({ error: 'Failed to retrieve audit logs' }, { status: 500 });
  }
}
