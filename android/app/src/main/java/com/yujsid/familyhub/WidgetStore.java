package com.yujsid.familyhub;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;

public final class WidgetStore {
    private static final String PREFS = "family_hub_widget";
    private static final String SNAPSHOT = "snapshot";

    private WidgetStore() {}

    public static final class Item {
        public final String kind;
        public final String title;
        public final String time;
        public final boolean allDay;
        public final boolean done;
        public final String dueLabel;
        public final boolean header;
        public final boolean shared;

        Item(String kind, String title, String time, boolean allDay, boolean done, String dueLabel, boolean header, boolean shared) {
            this.kind = kind;
            this.title = title;
            this.time = time;
            this.allDay = allDay;
            this.done = done;
            this.dueLabel = dueLabel == null ? "" : dueLabel;
            this.header = header;
            this.shared = shared;
        }

        static Item header(String title) {
            return new Item("header", title, "", false, false, "", true, false);
        }
    }

    public static final class DayList {
        public final boolean ready;
        public final List<Item> items;

        DayList(boolean ready, List<Item> items) {
            this.ready = ready;
            this.items = items;
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void saveSnapshot(Context context, String json) {
        prefs(context).edit().putString(SNAPSHOT, json == null ? "" : json).commit();
    }

    public static void setMember(Context context, int appWidgetId, String memberId) {
        prefs(context).edit().putString(memberKey(appWidgetId), memberId).commit();
    }

    public static String memberId(Context context, int appWidgetId) {
        return prefs(context).getString(memberKey(appWidgetId), "");
    }

    public static void clearMember(Context context, int appWidgetId) {
        prefs(context).edit().remove(memberKey(appWidgetId)).commit();
    }

    public static String memberLabel(String memberId) {
        if ("jaesang".equals(memberId)) return "재상";
        if ("sinjeong".equals(memberId)) return "신정";
        if ("sua".equals(memberId)) return "수아";
        if ("sumin".equals(memberId)) return "수민";
        if ("chilbok".equals(memberId)) return "실버";
        if ("family".equals(memberId)) return "공통";
        return "오늘";
    }

    public static final int SPAN_DAYS = 3;
    public static final String SHARED_MEMBER = "family";

    public static String seoulToday() {
        return seoulOffset(0);
    }

    public static String seoulOffset(int days) {
        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Seoul"));
        if (days != 0) cal.add(Calendar.DAY_OF_YEAR, days);
        return String.format(
            java.util.Locale.US,
            "%04d-%02d-%02d",
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH) + 1,
            cal.get(Calendar.DAY_OF_MONTH)
        );
    }

    public static String spanHeading() {
        return seoulHeading(seoulOffset(0)) + " – " + seoulHeading(seoulOffset(SPAN_DAYS - 1));
    }

    public static String seoulHeading(String ymd) {
        if (ymd == null || ymd.length() < 10) return "";
        String[] parts = ymd.split("-");
        int year = Integer.parseInt(parts[0]);
        int month = Integer.parseInt(parts[1]);
        int day = Integer.parseInt(parts[2]);
        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Seoul"));
        cal.clear();
        cal.set(year, month - 1, day);
        String[] weeks = {"일", "월", "화", "수", "목", "금", "토"};
        String week = weeks[cal.get(Calendar.DAY_OF_WEEK) - 1];
        return month + "월 " + day + "일 " + week;
    }

    public static DayList loadDay(Context context, String memberId) {
        String json = prefs(context).getString(SNAPSHOT, "");
        if (json == null || json.isEmpty()) return new DayList(false, new ArrayList<Item>());
        String today = seoulToday();
        try {
            JSONObject root = new JSONObject(json);
            JSONObject dates = root.optJSONObject("dates");
            if (dates == null || !dates.has(today)) return new DayList(false, new ArrayList<Item>());
            List<Item> items = new ArrayList<>();
            for (int offset = 0; offset < SPAN_DAYS; offset++) {
                String key = seoulOffset(offset);
                JSONArray rows = dates.optJSONArray(key);
                if (rows == null) continue;
                List<Item> dayItems = new ArrayList<>();
                for (int i = 0; i < rows.length(); i++) {
                    JSONObject row = rows.optJSONObject(i);
                    if (row == null) continue;
                    if (offset > 0 && row.optBoolean("overdue")) continue;
                    String who = row.optString("memberId");
                    boolean own = memberId.equals(who);
                    boolean shared = SHARED_MEMBER.equals(who);
                    if (!own && !shared) continue;
                    dayItems.add(new Item(
                        "todo".equals(row.optString("kind")) ? "todo" : "schedule",
                        row.optString("title", "(제목 없음)"),
                        row.optString("time", ""),
                        row.optBoolean("allDay"),
                        row.optBoolean("done"),
                        row.optBoolean("overdue") ? row.optString("dueLabel", "") : "",
                        false,
                        shared && !SHARED_MEMBER.equals(memberId)
                    ));
                }
                if (dayItems.isEmpty()) continue;
                String when = offset == 0 ? "오늘" : offset == 1 ? "내일" : "모레";
                items.add(Item.header(when + " · " + seoulHeading(key)));
                items.addAll(dayItems);
            }
            return new DayList(true, items);
        } catch (Exception ignored) {
            return new DayList(false, new ArrayList<Item>());
        }
    }

    private static String memberKey(int appWidgetId) {
        return "member_" + appWidgetId;
    }
}
