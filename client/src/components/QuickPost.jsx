import React, { useEffect, useState } from 'react';
import {
  fetchDonors,
  fetchConfig,
  createDonation,
} from '../services/api';

export default function QuickPost() {
  const donorId = new URLSearchParams(window.location.search).get('donorId');

  const [donor, setDonor] = useState(null);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('');
  const [meals, setMeals] = useState('10');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        if (!donorId) {
          throw new Error('Invalid QR link. Please contact the NGO.');
        }

        const [donorResponse, configResponse] = await Promise.all([
          fetchDonors(),
          fetchConfig(),
        ]);

        const donorList = Array.isArray(donorResponse)
          ? donorResponse
          : donorResponse.donors || [];

        const foundDonor = donorList.find((item) => item._id === donorId);

        if (!foundDonor) {
          throw new Error(
            'Shop not found. The QR link may be outdated. Please contact the NGO.'
          );
        }

        const config = configResponse.config || configResponse;
        const categoryConfig =
          config.categories || config.foodCategories || {};

        const categoryList = Array.isArray(categoryConfig)
          ? categoryConfig
          : Object.entries(categoryConfig).map(([key, value]) => ({
              key,
              ...value,
            }));

        const allowedCategories = categoryList.filter(
          (item) => item.donatable !== false
        );

        if (allowedCategories.length === 0) {
          throw new Error('Food categories are unavailable. Please try again later.');
        }

        const defaultCategory =
          foundDonor.type === 'bakery'
            ? 'bakery_baked'
            : 'cooked_hot';

        const initialCategory = allowedCategories.some(
          (item) => item.key === defaultCategory
        )
          ? defaultCategory
          : allowedCategories[0].key;

        setDonor(foundDonor);
        setCategories(allowedCategories);
        setCategory(initialCategory);
      } catch (err) {
        setError(err.message || 'Unable to load the quick-post form.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [donorId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess(false);

    const quantity = Number(meals);

    if (!donor || !category) {
      setError('Shop information is missing. Please reopen your QR link.');
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      setError('Enter a whole number of meals between 1 and 50.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await createDonation({
        donorId: donor._id,
        mealsOffered: quantity,
        category,
        readyAt: new Date().toISOString(),
        notes: notes.trim(),
      });

      if (!response.ok) {
        throw new Error(response.error || 'Unable to post surplus food.');
      }

      setSuccess(true);
      setMeals('10');
      setNotes('');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const styles = {
    page: {
      minHeight: '100vh',
      background: '#f4f8f5',
      padding: '24px 16px',
      fontFamily: 'Arial, sans-serif',
      color: '#183328',
    },
    card: {
      maxWidth: '440px',
      margin: '0 auto',
      padding: '24px',
      background: '#fff',
      borderRadius: '18px',
      boxShadow: '0 6px 24px rgba(0,0,0,0.07)',
    },
    label: {
      display: 'block',
      marginBottom: '8px',
      fontSize: '14px',
      fontWeight: 600,
    },
    field: {
      width: '100%',
      boxSizing: 'border-box',
      padding: '13px',
      marginBottom: '20px',
      border: '1px solid #d4dfd7',
      borderRadius: '9px',
      fontSize: '16px',
      background: '#fff',
    },
    button: {
      width: '100%',
      padding: '15px',
      border: 0,
      borderRadius: '10px',
      background: '#18794e',
      color: '#fff',
      fontSize: '16px',
      fontWeight: 700,
      cursor: 'pointer',
    },
    message: {
      padding: '12px',
      borderRadius: '8px',
      marginBottom: '16px',
      fontSize: '14px',
      lineHeight: 1.5,
    },
  };

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🥗</div>

        <h1 style={{ fontSize: '25px', margin: '0 0 8px' }}>
          Share Surplus Food
        </h1>

        <p style={{ color: '#64756b', lineHeight: 1.5, marginTop: 0 }}>
          A few details are all it takes to help feed someone tonight.
        </p>

        {loading ? (
          <p>Loading shop details...</p>
        ) : error && !donor ? (
          <div
            role="alert"
            style={{
              ...styles.message,
              background: '#fff0f0',
              color: '#a12626',
            }}
          >
            {error}
          </div>
        ) : success ? (
          <div
            role="status"
            style={{
              ...styles.message,
              background: '#e9f8ef',
              color: '#17653d',
            }}
          >
            <strong>Surplus posted successfully!</strong>
            <p style={{ marginBottom: 0 }}>
              Thank you, {donor?.name}. The NGO can now see your donation.
            </p>
            <button
              type="button"
              onClick={() => setSuccess(false)}
              style={{ ...styles.button, marginTop: '16px' }}
            >
              Post More Food
            </button>
          </div>
        ) : donor ? (
          <>
            <div
              style={{
                background: '#edf5ef',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '22px',
              }}
            >
              <div style={{ fontSize: '12px', color: '#64756b' }}>
                POSTING FOR
              </div>
              <strong>{donor.name}</strong>
              <div style={{ fontSize: '13px', marginTop: '4px' }}>
                {donor.address}
              </div>
            </div>

            {error && (
              <div
                role="alert"
                style={{
                  ...styles.message,
                  background: '#fff0f0',
                  color: '#a12626',
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <label style={styles.label} htmlFor="quick-category">
                What food is available?
              </label>

              <select
                id="quick-category"
                style={styles.field}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                required
              >
                {categories.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label || item.key}
                  </option>
                ))}
              </select>

              <label style={styles.label} htmlFor="quick-meals">
                Number of meals
              </label>

              <input
                id="quick-meals"
                style={styles.field}
                type="number"
                min="1"
                max="50"
                step="1"
                inputMode="numeric"
                value={meals}
                onChange={(event) => setMeals(event.target.value)}
                required
              />

              <label style={styles.label} htmlFor="quick-notes">
                Notes (optional)
              </label>

              <textarea
                id="quick-notes"
                style={{ ...styles.field, resize: 'vertical' }}
                rows="2"
                maxLength="200"
                placeholder="E.g. packed meals, pickup at side entrance"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />

              <p style={{ fontSize: '12px', color: '#64756b' }}>
                By submitting, you confirm the food is suitable for donation.
                The system will apply its configured collection deadline.
              </p>

              <button
                type="submit"
                style={{
                  ...styles.button,
                  opacity: submitting ? 0.65 : 1,
                }}
                disabled={submitting}
              >
                {submitting ? 'Posting...' : 'Post Surplus Food'}
              </button>
            </form>
          </>
        ) : null}

        <p
          style={{
            textAlign: 'center',
            fontSize: '12px',
            color: '#819087',
            marginTop: '20px',
            marginBottom: 0,
          }}
        >
          Micro-Donor Food Redistribution
        </p>
      </section>
    </main>
  );
}
