import mongoose from "mongoose";
import config from "./src/app/config";
import { Booking } from "./src/app/modules/calendar/calendar.model";
import { Accommodation } from "./src/app/modules/accommodation/accommodation.model";
import { CleaningSchedule } from "./src/app/modules/schedule/schedule.model";

mongoose.connect(config.database_url as string || "mongodb://127.0.0.1:27017/gestlio").then(async () => {
  const accs = await Accommodation.find({ name: /Appartement T3/i });
  console.log(`Found ${accs.length} accs`);
  for (const acc of accs) {
    console.log('Acc:', acc.name, acc._id);
    const bookings = await Booking.find({ 
      accommodation: acc._id, 
      isCancelled: false, 
      endDate: { $gte: new Date('2026-07-20') } 
    }).sort({ startDate: 1 });
    
    console.log('Bookings:', bookings.length);
    bookings.forEach((b, i) => {
       console.log(`${i}: start=${b.startDate.toISOString()} end=${b.endDate.toISOString()} summary='${b.summary}'`);
    });
  }

  const schedules = await CleaningSchedule.find({
     accommodation: { $in: accs.map(a => a._id) }
  });
  console.log('Schedules:');
  schedules.forEach((s, i) => {
     console.log(`Sched ${i}: date=${s.date.toISOString()} status=${s.status} refAt=${s.refusedAt}`);
  });

  mongoose.disconnect();
}).catch(console.error);
