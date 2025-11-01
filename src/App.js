import React, { useState, useEffect } from 'react';
import Tesseract from 'tesseract.js';

// 💡 NOTE: For a real mobile app (APK), you would import a native plugin here
// import { LocalNotifications } from '@capacitor/local-notifications';

const App = () => {
  // ✨ NEW: Initialize state from localStorage or use default values
  const [patientName, setPatientName] = useState(() => localStorage.getItem('patientName') || '');
  const [loginNumber, setLoginNumber] = useState(() => localStorage.getItem('loginNumber') || '');
  const [image, setImage] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [times, setTimes] = useState({});
  const [durations, setDurations] = useState({});

  // ✨ NEW: State for the custom reminder form
  const [customMedName, setCustomMedName] = useState('');
  const [customMedTime, setCustomMedTime] = useState('');
  const [customMedDuration, setCustomMedDuration] = useState('');

  // ✨ NEW: Initialize reminders from localStorage
  const [savedReminders, setSavedReminders] = useState(() => {
    const saved = localStorage.getItem('savedReminders');
    return saved ? JSON.parse(saved) : [];
  });
  const [ringingReminder, setRingingReminder] = useState(null);
  const [audio] = useState(new Audio('/alert.mp3'));


  // ✨ NEW: useEffect hooks to save state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('patientName', patientName);
  }, [patientName]);

  useEffect(() => {
    localStorage.setItem('loginNumber', loginNumber);
  }, [loginNumber]);

  useEffect(() => {
    localStorage.setItem('savedReminders', JSON.stringify(savedReminders));
  }, [savedReminders]);


  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
    // 💡 NOTE: For a mobile app, you would also request notification permissions here
    // LocalNotifications.requestPermissions();
  }, []);

  useEffect(() => {
    // This interval will only work when the app is open in the browser.
    // For a native app, the scheduled notifications would handle this automatically.
    const interval = setInterval(() => {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5);
      const today = new Date().toISOString().slice(0, 10);

      let updatedReminders = [];
      let shouldRing = false;

      savedReminders.forEach(reminder => {
        const startDate = new Date(reminder.startDate);
        const daysPassed = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
        const remainingDays = reminder.duration - daysPassed;

        if (remainingDays > 0) {
          if (reminder.time === currentTime && reminder.lastStoppedDate !== today && !ringingReminder) {
            showNotification(reminder.name);
            audio.play();
            setRingingReminder(reminder.name);
            shouldRing = true;
          }
          updatedReminders.push({
            ...reminder,
            remainingDays,
          });
        }
      });
      // Only update state if there is a change, to prevent unnecessary re-renders
      if (updatedReminders.length !== savedReminders.length || shouldRing) {
          setSavedReminders(updatedReminders);
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [savedReminders, audio, ringingReminder]);

  const stopReminder = () => {
    audio.pause();
    audio.currentTime = 0;
    const today = new Date().toISOString().slice(0, 10);

    const updated = savedReminders.map(r => {
      if (r.name === ringingReminder) {
        return {
          ...r,
          lastStoppedDate: today,
          // Correctly decrement remaining days only after acknowledging
          remainingDays: r.remainingDays > 0 ? r.remainingDays - 1 : 0,
        };
      }
      return r;
    });

    setSavedReminders(updated);
    setRingingReminder(null);
  };

  const showNotification = medicineName => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Medicine Reminder', {
        body: `It's time to take: ${medicineName}`,
        icon: '/pill.png',
      });
    }
  };

  const handleImageChange = e => {
    const file = e.target.files[0];
    if (file) {
      setImage(URL.createObjectURL(file));
      extractText(file);
    }
  };

  const extractText = file => {
    setLoading(true);
    setMedicines([]);
    Tesseract.recognize(file, 'eng+mal', {
      logger: m => {
        if (m.status === 'recognizing text') {
          setProgress(Math.floor(m.progress * 100));
        }
      },
    })
      .then(({ data: { text } }) => {
        const lowerText = text.toLowerCase();
        const meds = extractMedicines(lowerText);
        setMedicines(meds);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  const extractMedicines = text => {
    const lines = text.split('\n');
    const meds = [];
    const medPattern = /(dex|ors|fluid|tab|mg|tid|bid|sachet|iv|stat|dorzolamidua|syp|syrup|tablet|capsule|ml\b|q\d+h|x\s*\d+d|dextrose)/i;
    lines.forEach((line, idx) => {
      const cleanLine = line.trim();
      if (!cleanLine) return;
      const malayalamChars = cleanLine.match(/[\u0D00-\u0D7F]/g) || [];
      if (malayalamChars.length > cleanLine.length / 2) return;
      if (idx < 2) return;
      if (/^(for\b|b\s*\(superscription\))/i.test(cleanLine)) return;
      if (cleanLine.toLowerCase().indexOf('for') > -1 && cleanLine.toLowerCase().indexOf('for') < 10) return;
      if (medPattern.test(cleanLine)) {
        meds.push(cleanLine);
      }
    });
    return meds.length > 0 ? [...new Set(meds)] : ['No medicines detected'];
  };

  const handleTimeChange = (index, value) => {
    setTimes(prev => ({ ...prev, [index]: value }));
  };

  const handleDurationChange = (index, value) => {
    setDurations(prev => ({ ...prev, [index]: value }));
  };

  const handleSaveReminders = () => {
    if (!patientName.trim() || !loginNumber.trim()) {
      alert('Please enter both patient name and login number.');
      return;
    }

    const newReminders = medicines
      .map((med, idx) => ({
        id: Date.now() + idx, // ✨ NEW: Add a unique ID for each reminder
        name: med,
        time: times[idx],
        duration: durations[idx] ? parseInt(durations[idx]) : 1,
        startDate: new Date().toISOString().slice(0, 10),
        remainingDays: durations[idx] ? parseInt(durations[idx]) : 1,
        lastStoppedDate: null,
      }))
      .filter(item => item.time);

    if (newReminders.length === 0) {
      alert('Please select a time for at least one medicine from the prescription.');
      return;
    }
    
    // ✨ NEW: Add new reminders to existing ones instead of replacing them
    setSavedReminders(prev => [...prev, ...newReminders]);

    // 💡 NOTE: This is where you would schedule native notifications
    // scheduleNativeNotifications(newReminders);

    alert(`Reminders from prescription set for patient ${patientName}.`);
    // Clear the form after saving
    setMedicines([]);
    setImage(null);
  };

  // ✨ NEW: Function to add a single, custom reminder
  const handleAddCustomReminder = () => {
    if (!customMedName.trim() || !customMedTime || !customMedDuration) {
        alert('Please fill in the name, time, and duration for the custom reminder.');
        return;
    }

    if (!patientName.trim() || !loginNumber.trim()) {
      alert('Please enter the patient name and login number first.');
      return;
    }

    const newReminder = {
        id: Date.now(),
        name: customMedName.trim(),
        time: customMedTime,
        duration: parseInt(customMedDuration),
        startDate: new Date().toISOString().slice(0, 10),
        remainingDays: parseInt(customMedDuration),
        lastStoppedDate: null,
    };

    setSavedReminders(prev => [...prev, newReminder]);

    // Clear the custom input fields
    setCustomMedName('');
    setCustomMedTime('');
    setCustomMedDuration('');
    
    alert(`Custom reminder for "${newReminder.name}" has been added.`);
  };


  // 💡 NOTE: Example function for scheduling native notifications
  // const scheduleNativeNotifications = async (reminders) => {
  //   const notifications = reminders.map(r => {
  //     const [hour, minute] = r.time.split(':');
  //     return {
  //       id: r.id,
  //       title: 'Medicine Reminder',
  //       body: `Time to take: ${r.name}`,
  //       schedule: {
  //         on: { hour: parseInt(hour), minute: parseInt(minute) },
  //         repeats: true
  //       },
  //       sound: 'default'
  //     };
  //   });
  //   await LocalNotifications.schedule({ notifications });
  // };

  const stopAllReminders = () => {
    // 💡 NOTE: For a mobile app, you would also cancel all scheduled native notifications here
    // const ids = savedReminders.map(r => r.id);
    // LocalNotifications.cancel({ notifications: ids.map(id => ({ id })) });
    setSavedReminders([]);
    audio.pause();
    audio.currentTime = 0;
    setRingingReminder(null);
    alert('All reminders stopped and cleared.');
  };

  // The rest of the component (JSX) and styles remain the same...

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>Medicine Reminder from Prescription</h2>

      <div style={styles.patientInfo}>
        <input
          type="text"
          placeholder="Patient Name"
          value={patientName}
          onChange={e => setPatientName(e.target.value)}
          style={styles.input}
        />
        <input
          type="text"
          placeholder="Login Number"
          value={loginNumber}
          onChange={e => setLoginNumber(e.target.value)}
          style={styles.input}
        />
      </div>

      <input type="file" accept="image/*" onChange={handleImageChange} style={styles.fileInput} />

      {image && (
        <div style={styles.imagePreviewContainer}>
          <img src={image} alt="Prescription Preview" style={styles.imagePreview} />
        </div>
      )}

      {loading && (
        <div style={styles.loading}>
          <p>Extracting medicines... {progress}%</p>
          <progress value={progress} max="100" style={{ width: '100%' }} />
        </div>
      )}

      {medicines.length > 0 && (
        <>
          <h3 style={styles.subHeader}>Detected Medicines:</h3>
          {medicines.map((med, index) => (
            <div key={index} style={styles.medicineRow}>
              <strong style={{ flex: 1 }}>{med}</strong>
              <input
                type="time"
                value={times[index] || ''}
                onChange={e => handleTimeChange(index, e.target.value)}
                style={styles.timeInput}
              />
              <input
                type="number"
                min="1"
                placeholder="Duration (days)"
                value={durations[index] || ''}
                onChange={e => handleDurationChange(index, e.target.value)}
                style={styles.durationInput}
              />
            </div>
          ))}
          <button onClick={handleSaveReminders} style={styles.saveButton}>
            Save Reminders from Prescription
          </button>
        </>
      )}

      {/* ✨ NEW: Section for adding a custom reminder */}
      <h3 style={styles.subHeader}>Add a Custom Reminder</h3>
      <div style={styles.medicineRow}>
        <input
          type="text"
          placeholder="Medicine or Reminder Name"
          value={customMedName}
          onChange={(e) => setCustomMedName(e.target.value)}
          style={{ ...styles.input, flex: 2, marginRight: '1rem' }}
        />
        <input
          type="time"
          value={customMedTime}
          onChange={(e) => setCustomMedTime(e.target.value)}
          style={styles.timeInput}
        />
        <input
          type="number"
          min="1"
          placeholder="Duration (days)"
          value={customMedDuration}
          onChange={(e) => setCustomMedDuration(e.target.value)}
          style={styles.durationInput}
        />
      </div>
      <button onClick={handleAddCustomReminder} style={{...styles.saveButton, marginTop: '1rem'}}>
        Add Custom Reminder
      </button>


      {ringingReminder && (
        <div style={styles.reminderBox}>
          <strong>Reminder:</strong> It's time to take <b>{ringingReminder}</b>
          <br />
          <button onClick={stopReminder} style={styles.stopReminderButton}>
            I took the medicine — Stop Reminder
          </button>
        </div>
      )}

      {savedReminders.length > 0 && (
        <>
          <h3 style={styles.subHeader}>Saved Reminders:</h3>
          <ul style={styles.reminderList}>
            {savedReminders.map((item) => (
              <li key={item.id}>
                {item.name} — {item.time} — Remaining {item.remainingDays ?? item.duration} day
                {(item.remainingDays ?? item.duration) !== 1 ? 's' : ''}
              </li>
            ))}
          </ul>
          <button onClick={stopAllReminders} style={styles.stopAllButton}>
            Clear All Reminders
          </button>
        </>
      )}
    </div>
  );
};


const styles = {
  container: {
    maxWidth: 700,
    margin: '2rem auto',
    padding: '2rem',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    borderRadius: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    background: 'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)',
    color: '#fff',
  },
  header: {
    textAlign: 'center',
    marginBottom: '1.5rem',
    textShadow: '0 1px 4px rgba(0,0,0,0.4)',
  },
  patientInfo: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  input: {
    flex: 1,
    padding: '0.5rem 1rem',
    fontSize: '1rem',
    borderRadius: 6,
    border: 'none',
    outline: 'none',
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
  },
  fileInput: {
    display: 'block',
    marginBottom: '1rem',
    width: '100%',
    padding: '0.3rem',
    borderRadius: 6,
    cursor: 'pointer',
  },
  imagePreviewContainer: {
    textAlign: 'center',
    marginBottom: '1rem',
  },
  imagePreview: {
    maxWidth: '250px',
    maxHeight: '150px',
    objectFit: 'contain',
    borderRadius: 8,
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  loading: {
    marginTop: '1rem',
    textAlign: 'center',
  },
  subHeader: {
    marginTop: '2rem',
    marginBottom: '1rem',
    borderBottom: '2px solid rgba(255,255,255,0.5)',
    paddingBottom: '0.3rem',
  },
  medicineRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '1rem',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: '0.6rem 1rem',
    borderRadius: 8,
    boxShadow: 'inset 0 0 6px rgba(255,255,255,0.3)',
  },
  timeInput: {
    flexBasis: '120px',
    padding: '0.3rem 0.6rem',
    fontSize: '1rem',
    borderRadius: 6,
    border: 'none',
    outline: 'none',
  },
  durationInput: {
    flexBasis: '150px',
    padding: '0.3rem 0.6rem',
    fontSize: '1rem',
    borderRadius: 6,
    border: 'none',
    outline: 'none',
  },
  saveButton: {
    backgroundColor: '#1b74e4',
    color: 'white',
    padding: '0.7rem 1.5rem',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: '600',
    boxShadow: '0 4px 12px rgba(27,116,228,0.5)',
    transition: 'background-color 0.3s ease',
  },
  reminderBox: {
    marginTop: '2rem',
    padding: '1rem',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    border: '1px solid #0f0',
    color: '#c8ffc8',
    textShadow: '0 1px 2px rgba(0,0,0,0.7)',
  },
  stopReminderButton: {
    marginTop: '1rem',
    backgroundColor: '#27ae60',
    color: 'white',
    padding: '0.5rem 1rem',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: '600',
    boxShadow: '0 3px 6px rgba(39,174,96,0.6)',
  },
  reminderList: {
    marginTop: '1rem',
    paddingLeft: '1.2rem',
    color: '#f0f0f0',
  },
  stopAllButton: {
    marginTop: '1rem',
    backgroundColor: '#c0392b',
    color: 'white',
    padding: '0.7rem 1.5rem',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: '600',
    boxShadow: '0 4px 12px rgba(192,57,43,0.5)',
  },
};

export default App;