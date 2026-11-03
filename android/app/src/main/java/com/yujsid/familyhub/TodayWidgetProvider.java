package com.yujsid.familyhub;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

import java.util.Calendar;
import java.util.TimeZone;

@SuppressWarnings("deprecation")
public class TodayWidgetProvider extends AppWidgetProvider {
    static final String ACTION_ROLL_DATE = "com.yujsid.familyhub.action.WIDGET_ROLL_DATE";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateOne(context, manager, appWidgetId);
        }
        manager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.widget_list);
        scheduleMidnight(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent != null && ACTION_ROLL_DATE.equals(intent.getAction())) {
            refreshAll(context);
        }
    }

    @Override
    public void onEnabled(Context context) {
        scheduleMidnight(context);
    }

    @Override
    public void onDisabled(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(midnightIntent(context));
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) WidgetStore.clearMember(context, appWidgetId);
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TodayWidgetProvider.class));
        if (ids == null || ids.length == 0) return;
        for (int id : ids) updateOne(context, manager, id);
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    static void updateOne(Context context, int appWidgetId) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        updateOne(context, manager, appWidgetId);
        manager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_list);
    }

    private static void updateOne(Context context, AppWidgetManager manager, int appWidgetId) {
        String memberId = WidgetStore.memberId(context, appWidgetId);
        WidgetStore.DayList day = WidgetStore.loadDay(context, memberId);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);
        views.setTextViewText(R.id.widget_title, WidgetStore.memberLabel(memberId));
        views.setTextViewText(R.id.widget_date, WidgetStore.spanHeading());
        if (!day.ready) {
            views.setTextViewText(R.id.widget_empty, "가족허브를 한 번 열면 오늘부터 모레 일정이 나타납니다");
        } else if (day.items.isEmpty()) {
            views.setTextViewText(R.id.widget_empty, "오늘부터 모레까지 일정과 할일이 없습니다");
        }
        if (day.items.isEmpty()) {
            views.setViewVisibility(R.id.widget_list, android.view.View.GONE);
            views.setViewVisibility(R.id.widget_empty, android.view.View.VISIBLE);
        } else {
            views.setViewVisibility(R.id.widget_list, android.view.View.VISIBLE);
            views.setViewVisibility(R.id.widget_empty, android.view.View.GONE);
        }
        Intent service = new Intent(context, TodayWidgetService.class);
        service.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        service.setData(Uri.parse(service.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_list, service);
        views.setPendingIntentTemplate(R.id.widget_list, openAppIntent(context, appWidgetId, true));
        PendingIntent open = openAppIntent(context, appWidgetId + 1000, false);
        views.setOnClickPendingIntent(R.id.widget_root, open);
        views.setOnClickPendingIntent(R.id.widget_title, open);
        views.setOnClickPendingIntent(R.id.widget_date, open);
        views.setOnClickPendingIntent(R.id.widget_empty, open);
        manager.updateAppWidget(appWidgetId, views);
    }

    private static PendingIntent openAppIntent(Context context, int requestCode, boolean mutable) {
        Intent launch = new Intent(context, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (mutable && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
        else if (!mutable) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(context, requestCode, launch, flags);
    }

    private static void scheduleMidnight(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Seoul"));
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 5);
        cal.set(Calendar.SECOND, 10);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis()) cal.add(Calendar.DAY_OF_YEAR, 1);
        alarms.setAndAllowWhileIdle(AlarmManager.RTC, cal.getTimeInMillis(), midnightIntent(context));
    }

    private static PendingIntent midnightIntent(Context context) {
        Intent intent = new Intent(context, TodayWidgetProvider.class);
        intent.setAction(ACTION_ROLL_DATE);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, 0, intent, flags);
    }
}
