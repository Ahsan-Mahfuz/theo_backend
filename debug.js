"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("./src/app/config"));
const calendar_model_1 = require("./src/app/modules/calendar/calendar.model");
const accommodation_model_1 = require("./src/app/modules/accommodation/accommodation.model");
const schedule_model_1 = require("./src/app/modules/schedule/schedule.model");
mongoose_1.default.connect(config_1.default.database_url || "mongodb://127.0.0.1:27017/gestlio").then(() => __awaiter(void 0, void 0, void 0, function* () {
    const accs = yield accommodation_model_1.Accommodation.find({ name: /Appartement T3/i });
    console.log(`Found ${accs.length} accs`);
    for (const acc of accs) {
        console.log('Acc:', acc.name, acc._id);
        const bookings = yield calendar_model_1.Booking.find({
            accommodation: acc._id,
            isCancelled: false,
            endDate: { $gte: new Date('2026-07-20') }
        }).sort({ startDate: 1 });
        console.log('Bookings:', bookings.length);
        bookings.forEach((b, i) => {
            console.log(`${i}: start=${b.startDate.toISOString()} end=${b.endDate.toISOString()} summary='${b.summary}'`);
        });
    }
    const schedules = yield schedule_model_1.CleaningSchedule.find({
        accommodation: { $in: accs.map(a => a._id) }
    });
    console.log('Schedules:');
    schedules.forEach((s, i) => {
        console.log(`Sched ${i}: date=${s.date.toISOString()} status=${s.status} refAt=${s.refusedAt}`);
    });
    mongoose_1.default.disconnect();
})).catch(console.error);
