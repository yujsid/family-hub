package com.yujsid.familyhub;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

public class TodayWidgetService extends RemoteViewsService {
    static String clock12(String raw) {
        if (raw == null) return "";
        String[] parts = raw.trim().split(":", -1);
        if (parts.length != 2) return raw;
        try {
            int hour = Integer.parseInt(parts[0]);
            int minute = Integer.parseInt(parts[1]);
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return raw;
            String period = hour < 12 ? "오전" : "오후";
            int hour12 = hour % 12;
            if (hour12 == 0) hour12 = 12;
            return period + " " + hour12 + ":" + String.format(java.util.Locale.US, "%02d", minute);
        } catch (NumberFormatException ex) {
            return raw;
        }
    }

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext(), intent.getIntExtra(
            android.appwidget.AppWidgetManager.EXTRA_APPWIDGET_ID,
            android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID
        ));
    }

    static final class Factory implements RemoteViewsFactory {
        private final Context context;
        private final int appWidgetId;
        private List<WidgetStore.Item> items = new ArrayList<>();

        Factory(Context context, int appWidgetId) {
            this.context = context;
            this.appWidgetId = appWidgetId;
        }

        @Override
        public void onCreate() {
            load();
        }

        @Override
        public void onDataSetChanged() {
            load();
        }

        private void load() {
            String memberId = WidgetStore.memberId(context, appWidgetId);
            WidgetStore.DayList day = WidgetStore.loadDay(context, memberId);
            items = day.items;
        }

        @Override
        public void onDestroy() {
            items = new ArrayList<>();
        }

        @Override
        public int getCount() {
            return items.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= items.size()) {
                return new RemoteViews(context.getPackageName(), R.layout.widget_today_row);
            }
            WidgetStore.Item item = items.get(position);
            if (item.header) {
                RemoteViews header = new RemoteViews(context.getPackageName(), R.layout.widget_today_header);
                header.setTextViewText(R.id.widget_day_label, item.title);
                header.setOnClickFillInIntent(R.id.widget_day_label, new Intent());
                return header;
            }
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today_row);
            boolean todo = "todo".equals(item.kind);
            views.setTextViewText(R.id.widget_row_kind, todo ? "할일" : "일정");
            views.setTextColor(R.id.widget_row_kind, todo ? 0xFFB8860B : 0xFF5E8F74);
            String title = item.done ? "✓ " + item.title : item.title;
            views.setTextViewText(R.id.widget_row_title, title);
            views.setTextColor(R.id.widget_row_title, item.done ? 0xFF8A7968 : 0xFF3D3428);
            String meta;
            if (item.done) meta = "완료";
            else if (item.dueLabel != null && !item.dueLabel.isEmpty()) meta = item.dueLabel + " 지연";
            else if (item.allDay || item.time.isEmpty()) meta = todo ? "" : "하루 종일";
            else meta = clock12(item.time);
            if (item.shared) meta = meta.isEmpty() ? "공통" : "공통 · " + meta;
            views.setTextViewText(R.id.widget_row_meta, meta);
            views.setOnClickFillInIntent(R.id.widget_row_root, new Intent());
            return views;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 2;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return true;
        }
    }
}
