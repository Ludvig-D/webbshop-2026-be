import {
  getAllEvents,
  findEventsByType,
  searchInEvents,
  createEvent,
  findEventByName,
  findEventById,
} from '../db/events.js';
import { checkTrainer } from '../db/roles.js';
import { findEventtype, addEventtypeToEvent } from '../db/types.js';
import mongoose from 'mongoose';
import Event from '../models/Event.js';

class EventController {
  eventsGet = [
    async (req, res) => {
      const { kategori, search } = req.query;
      let events;

      try {
        // Logga query-parametrar om de finns
        if (kategori || search) {
          console.log('Received query parameters:', req.query);
        }

        // Hämta events
        events = await getAllEvents();

        if (events.length === 0) {
          console.log('No events found');
          return res.status(404).json({ message: 'No events found' });
        }

        if (kategori) {
          events = await findEventsByType(kategori, events);
        }

        if (search) {
          events = await searchInEvents(search, events);
        }

        res.status(200).json({ count: events.length, events });
      } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ error: 'Failed to fetch events' });
      }
    },
  ];

  eventGet = [
    async (req, res, next) => {
      const { id } = req.params;

      try {
        const event = await findEventById(id);

        if (!event) {
          console.log(`Event with ID ${id} not found`);
          return res.status(404).json({ message: 'Event not found' });
        }

        res.status(200).json(event);
      } catch (error) {
        console.error('Error fetching event by ID:', error);
        next(error);
      }
    },
  ];

  eventPost = [
    async (req, res) => {
      const {
        title,
        description,
        date,
        startTime,
        endTime,
        type,
        maxseats,
        location,
        trainerId,
        price,
      } = req.body;

      if (
        !title ||
        !description ||
        !date ||
        !startTime ||
        !endTime ||
        !type ||
        !maxseats ||
        !location ||
        !trainerId ||
        !price
      ) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      if (isNaN(maxseats) || maxseats <= 0 || !Number.isInteger(maxseats)) {
        return res.status(400).json({ error: 'Invalid maxseats value' });
      }

      if (typeof date !== 'string' || isNaN(Date.parse(date))) {
        return res.status(400).json({ error: 'Invalid date format' });
      }
      // checks so date hasnt passed yet
      if (Date.parse(date) < Date.now()) {
        return res.status(400).json({ error: 'Date has past' });
      }

      // /(^([0-1][0-9]|2[0-3]):[0-5][0-9]$)/ regex for checking hh:mm
      if (
        !/(^([0-1][0-9]|2[0-3]):[0-5][0-9]$)/.test(startTime) ||
        !/(^([0-1][0-9]|2[0-3]):[0-5][0-9]$)/.test(endTime)
      ) {
        return res.status(400).json({ error: 'StartTime or EndTime invalid' });
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const existingEvent = await findEventByName(title);
        if (existingEvent) {
          await session.abortTransaction();
          return res
            .status(400)
            .json({ error: 'Event with this title already exists' });
        }

        const eventtype = await findEventtype(type);
        if (!eventtype) {
          await session.abortTransaction();
          return res.status(400).json({ error: 'Invalid event type' });
        }

        //checks if trainerId is a user and is a trainer
        const trainer = await checkTrainer(trainerId);
        if (!trainer) {
          await session.abortTransaction();
          return res.status(400).json({ error: 'Invalid trainer' });
        }

        const newEvent = await createEvent(
          {
            title,
            description,
            time: {
              date,
              startTime,
              endTime,
            },
            maxseats,
            location,
            trainerid: trainer.id,
            price,
          },
          { session }
        );

        if (!newEvent) {
          await session.abortTransaction();
          return res.status(500).json({ error: 'Failed to create event' });
        }

        const updated = await addEventtypeToEvent(type, newEvent._id, {
          session,
        });
        if (!updated) {
          await session.abortTransaction();
          return res.status(500).json({ error: 'Failed to link event type' });
        }

        await session.commitTransaction();
        res.status(201).json(newEvent);
      } catch (error) {
        await session.abortTransaction();
        console.error('Error creating event:', error);
        res.status(500).json({ error: 'Failed to create event' });
      } finally {
        session.endSession();
      }
    },
  ];

  editEventPut = [
    async (req, res) => {
      const { id } = req.params;

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        if (!id) return res.status(400).json({ error: 'Event ID is required' });

        const {
          title,
          description,
          date,
          type,
          maxseats,
          location,
          startTime,
          endTime,
          price,
        } = req.body;

        if (
          !title &&
          !description &&
          !date &&
          !type &&
          !maxseats &&
          !location &&
          !startTime &&
          !endTime &&
          !price
        )
          return res
            .status(400)
            .json({ error: 'At least one field must be provided for update' });

        const event = await Event.findById(id);

        if (!event) return res.status(404).json({ error: 'Event not found' });

        if (title) event.title = title;
        if (description) event.description = description;
        if (location) event.location = location;

        if (price) {
          if (!Number(price)) {
            return res.status(400).json({ error: 'Invalid date format' });
          }
          event.price = price;
        }

        if (date) {
          if (isNaN(Date.parse(date))) {
            return res.status(400).json({ error: 'Invalid date format' });
          }
          event.time.date = date;
        }

        if (startTime) {
          if (!/(^([0-1][0-9]|2[0-3]):[0-5][0-9]$)/.test(startTime)) {
            return res.status(400).json({ error: 'StartTime is invalid' });
          }
          event.time.startTime = startTime;
        }

        if (endTime) {
          if (!/(^([0-1][0-9]|2[0-3]):[0-5][0-9]$)/.test(endTime)) {
            return res.status(400).json({ error: 'EndTime is invalid' });
          }
          event.time.endTime = endTime;
        }

        if (maxseats) {
          if (isNaN(maxseats) || maxseats <= 0 || !Number(maxseats)) {
            return res.status(400).json({ error: 'Invalid maxseats value' });
          }
          event.maxseats = maxseats;
        }

        if (type) {
          if (type.isArray()) {
            for (const t of type) {
              if (typeof t !== 'string') {
                return res
                  .status(400)
                  .json({ error: 'Each event type must be a string' });
              }
              const eventtype = await findEventtype(t);
              if (!eventtype) {
                return res
                  .status(400)
                  .json({ error: `Invalid event type: ${t}` });
              }
              await addEventtypeToEvent(t, event._id);
            }
          } else {
            const eventtype = await findEventtype(type);
            if (!eventtype) {
              return res.status(400).json({ error: 'Invalid event type' });
            }
            await addEventtypeToEvent(type, event._id);
          }
        }

        await event.save();

        await session.commitTransaction();
        session.endSession();
        res.status(200).json(event);
      } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error('Error editing event:', error);
        res.status(500).json({ error: 'Failed to edit event' });
      }
    },
  ];

  eventDelete = [
    async (req, res) => {
      const { id } = req.params;

      try {
        if (!id) {
          return res.status(400).json({ error: 'Event ID is required' });
        }

        const event = await Event.findById(id);

        if (!event) {
          return res.status(404).json({ error: 'Event not found' });
        }

        await event.deleteOne();
        res.status(200).json({ message: 'Event deleted successfully' });
      } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({ error: 'Failed to delete event' });
      }
    },
  ];

  getArchivedEvents = [
    async (req, res) => {
      try {
        const events = await getAllEvents();

        if (events.length === 0) {
          console.log('No events found');
          return res.status(404).json({ message: 'No events found' });
        }
        const archivedEvents = events.filter((event) => {
          const eventDate = new Date(event.time.date);
          const now = new Date();
          return eventDate < now;
        });

        res
          .status(200)
          .json({ count: archivedEvents.length, events: archivedEvents });
      } catch (error) {
        console.error('Error fetching archived events:', error);
        res.status(500).json({ error: 'Failed to fetch archived events' });
      }
    },
  ];
}

export default new EventController();
